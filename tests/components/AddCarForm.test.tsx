// Place at: tests/components/AddCarForm.test.tsx
//
// AddCarForm mirrors AddBikeForm's plate-lookup and duplicate-handling
// pattern, simplified: no curated make/model list (free text, filled in
// directly from the lookup - no "matched in our list" branching), no
// MOT-mileage-floor prefill, no request-ownership flow (car transfer
// isn't built). Only fetch and next/navigation's useRouter are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { AddCarForm } from "@/app/dashboard/AddCarForm";

function jsonOk(data: unknown) {
  return { ok: true, json: async () => data };
}
function jsonErr(data: unknown) {
  return { ok: false, json: async () => data };
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, { make = "Ford", model = "Focus", engineLitres = "1.6", year = "2020", registration = "AB12CDE", mileage = "40000" } = {}) {
  await user.clear(screen.getByLabelText("Make"));
  await user.type(screen.getByLabelText("Make"), make);
  await user.clear(screen.getByLabelText("Model"));
  await user.type(screen.getByLabelText("Model"), model);
  await user.clear(screen.getByLabelText("Engine size (litres)"));
  await user.type(screen.getByLabelText("Engine size (litres)"), engineLitres);
  await user.clear(screen.getByLabelText("Year"));
  await user.type(screen.getByLabelText("Year"), year);
  await user.type(screen.getByLabelText("Registration number"), registration);
  await user.type(screen.getByLabelText("Current mileage"), mileage);
}

describe("AddCarForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to petrol with make/model free-text and the engine size + year fields visible", () => {
    render(<AddCarForm />);
    expect(screen.getByLabelText("Fuel type")).toHaveValue("petrol");
    expect(screen.getByLabelText("Make")).toHaveValue("");
    expect(screen.getByLabelText("Model")).toHaveValue("");
    expect(screen.getByLabelText("Engine size (litres)")).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toBeInTheDocument();
    expect(screen.queryByLabelText(/Battery size/)).not.toBeInTheDocument();
  });

  it("switching fuel type to electric hides engine size and year, and shows the battery field", async () => {
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.selectOptions(screen.getByLabelText("Fuel type"), "electric");
    expect(screen.queryByLabelText("Engine size (litres)")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Year")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Battery size/)).toBeInTheDocument();
  });

  it("checking 'custom build' hides the year field even for a fuelled car", async () => {
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.click(screen.getByLabelText(/custom build/i));
    expect(screen.queryByLabelText("Year")).not.toBeInTheDocument();
  });

  it("rejects a missing engine size for a non-electric car, without ever calling fetch", async () => {
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Make"), "Ford");
    await user.type(screen.getByLabelText("Model"), "Focus");
    // Year filled so the input's own native `required` constraint
    // doesn't block form submission before our JS validation even runs -
    // this test is specifically about the engine-size check.
    await user.type(screen.getByLabelText("Year"), "2020");
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.type(screen.getByLabelText("Current mileage"), "40000");
    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid engine size in litres.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("look up: an empty registration is refused before any fetch call", async () => {
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Enter a registration number first.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("look up: a motorcycle result is refused with a specific message and never checks for duplicates", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonOk({ vrm: "AB12CDE", make: "Honda", model: "CB500F", year: 2020, fuelType: "PETROL", engineCapacityCc: 471, plateInRetention: false, vehicleType: "motorcycle" })
    );
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/looks like a motorcycle/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("look up: fills make/model/year/engine size directly from the response, with no curated-list matching", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByLabelText("Make")).toHaveValue("Ford");
    expect(screen.getByLabelText("Model")).toHaveValue("Focus");
    expect(screen.getByLabelText("Year")).toHaveValue(2020);
    expect(screen.getByLabelText("Engine size (litres)")).toHaveValue(1.6);
    expect(screen.getByText(/Filled in from the registration: Ford Focus/)).toBeInTheDocument();
  });

  it("look up: guesses fuel type from DVLA's own field, defaulting the select to Electric", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Tesla", model: "Model 3", year: 2022, fuelType: "ELECTRICITY", engineCapacityCc: null, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByLabelText("Fuel type")).toHaveValue("electric");
    expect(screen.queryByLabelText("Engine size (litres)")).not.toBeInTheDocument();
  });

  it("look up: a duplicate already on this account offers to switch straight to it", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: true, carId: "car-42" }))
      .mockResolvedValueOnce(jsonOk({}));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already added this car/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue(""); // lookup data never applied

    await user.click(screen.getByRole("button", { name: "Go to this car" }));
    expect(mockRouter.push).toHaveBeenCalledWith("/dashboard");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/cars/active-car",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ carId: "car-42" }) })
    );
  });

  it("look up: a duplicate on someone else's account offers 'start fresh' with no ownership-request option at all", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: false }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already tracked on a different account/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request ownership" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Start fresh" }));
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/cars/car",
      expect.objectContaining({ body: expect.stringContaining('"mayHavePriorHistory":true') })
    );
  });

  it("submits the full form state to /api/cars/car", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk({ car: { id: "new-car-1" } }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          make: "Ford",
          model: "Focus",
          fuelType: "petrol",
          engineLitres: 1.6,
          batteryKwh: undefined,
          year: 2020,
          isCustomBuild: false,
          registration: "AB12CDE",
          currentMileage: 40000,
          nickname: "",
          region: "rest-england-wales",
          mayHavePriorHistory: false,
        }),
      })
    );
  });

  it("shows the server's own error when the API rejects the submit", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonErr({ error: "Something went wrong." }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });
});
