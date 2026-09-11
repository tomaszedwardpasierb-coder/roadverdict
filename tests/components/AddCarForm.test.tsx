// Place at: tests/components/AddCarForm.test.tsx
//
// AddCarForm mirrors AddBikeForm's curated make/model select, plate-lookup,
// MOT-mileage-floor prefill, and duplicate-handling pattern - simplified
// only in that there's no request-ownership flow (car transfer isn't
// built) and no per-model engine-size data (engineLitres always stays a
// plain user-entered field). Only fetch and next/navigation's useRouter
// are mocked - everything else (React state, the real CAR_MODELS list,
// the real MOT-mileage-floor validation) runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

async function selectFordFocus(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Make"), "Ford");
  await user.selectOptions(screen.getByLabelText("Model"), "Focus");
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, { engineLitres = "1.6", year = "2020", registration = "AB12CDE", mileage = "40000" } = {}) {
  await selectFordFocus(user);
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

  it("renders the first curated brand/model selected by default, with petrol fuel type and the year field visible", () => {
    render(<AddCarForm />);
    expect(screen.getByLabelText("Fuel type")).toHaveValue("petrol");
    expect(screen.getByLabelText("Make")).toHaveValue("Abarth");
    expect(screen.getByLabelText("Model")).toHaveValue("500");
    expect(screen.getByLabelText("Engine size (litres)")).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toBeRequired();
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

  it("picking 'Other / not in this list' for the make skips straight to custom make + custom model fields", async () => {
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.selectOptions(screen.getByLabelText("Make"), "__other__");
    expect(screen.getByLabelText("Make (enter manually)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Model (enter manually)")).toBeInTheDocument();
    // Unlike a bike, engine size stays a plain field regardless of match
    // status - no separate "custom engine size" input to switch to.
    expect(screen.getByLabelText("Engine size (litres)")).toBeInTheDocument();
  });

  it("rejects a missing engine size for a non-electric car, without ever calling fetch", async () => {
    const user = userEvent.setup();
    render(<AddCarForm />);
    // Year filled so the input's own native `required` constraint doesn't
    // block form submission before our JS validation even runs.
    await user.type(screen.getByLabelText("Year"), "2020");
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.type(screen.getByLabelText("Current mileage"), "40000");
    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid engine size in litres.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("look up: shows the car spinner on Look up while the lookup request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    const button = screen.getByRole("button", { name: "Looking up…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch(jsonErr({ error: "No vehicle found." }));
    await screen.findByRole("button", { name: "Look up" });
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

  it("look up: a matched make and model auto-fills the form and pulls in the real MOT mileage floor", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2018, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: 12000, latestTestDate: "2025-01-01" }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("Ford"));
    expect(screen.getByLabelText("Model")).toHaveValue("Focus");
    expect(screen.getByLabelText("Year")).toHaveValue(2018);
    expect(screen.getByLabelText("Engine size (litres)")).toHaveValue(1.6);
    expect(screen.getByText(/Matched to Ford Focus in our list\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Current mileage")).toHaveValue(12000);
    expect(screen.getByText(/recorded 12,000 miles/)).toBeInTheDocument();
    expect(screen.getByLabelText(/I confirm this mileage is correct/)).toBeInTheDocument();
  });

  it("look up: a make match with a model not in our list drops into a custom model field pre-filled with the real data", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Some Rare Trim", year: 2018, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: null }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("Ford"));
    expect(screen.getByLabelText("Model (enter manually)")).toHaveValue("Some Rare Trim");
    expect(screen.getByText(/isn't in our model list/)).toBeInTheDocument();
  });

  it("look up: guesses fuel type from DVLA's own field, defaulting the select to Electric", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Tesla", model: "Model 3", year: 2022, fuelType: "ELECTRICITY", engineCapacityCc: null, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: null }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Fuel type")).toHaveValue("electric"));
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
    // The lookup data was never applied, since car-exists short-circuited before it.
    expect(screen.getByLabelText("Make")).toHaveValue("Abarth");

    await user.click(screen.getByRole("button", { name: "Go to this car" }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/dashboard"));
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/cars/active-car",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ carId: "car-42" }) })
    );
  });

  it("look up: shows the car spinner on 'Go to this car' while the switch request is in flight", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: true, carId: "car-42" }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText(/already added this car/i);

    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    const button = screen.getByRole("button", { name: "Go to this car" });
    await user.click(button);

    expect(screen.getByRole("button", { name: "Switching…" }).querySelector("svg")).toBeInTheDocument();
    resolveFetch(jsonOk({}));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/dashboard"));
  });

  it("look up: a duplicate on someone else's account offers request-ownership, which reports the server's own error on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: false }))
      .mockResolvedValueOnce(jsonErr({ error: "Ownership requests are limited to 3 per day." }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already has a RoadVerdict history/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request ownership" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ownership requests are limited to 3 per day.");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/cars/car-transfer/request-ownership",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ registration: "AB12CDE" }) })
    );
  });

  it("look up: shows the car spinner on 'Request ownership' while that request is in flight", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: false }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText(/already has a RoadVerdict history/i);

    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValueOnce(new Promise((resolve) => { resolveFetch = resolve; }));
    await user.click(screen.getByRole("button", { name: "Request ownership" }));

    const button = screen.getByRole("button", { name: "Sending…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch(jsonOk({}));
    await screen.findByText(/Request sent/);
  });

  it("look up: 'start fresh' on a duplicate applies the held lookup data without a second network round-trip, and flags the eventual submit as mayHavePriorHistory", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: null }))
      .mockResolvedValueOnce(jsonOk({ car: { id: "new-car-1" } }))
      .mockResolvedValueOnce(jsonOk({}));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText(/already has a RoadVerdict history/i);

    await user.click(screen.getByRole("button", { name: "Start fresh, without requesting" }));
    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("Ford"));
    // Calls so far: plate-lookup, car-exists, then the mot-history-preview
    // that applyLookupData made on the already-held data - a 4th call
    // would mean it looked the plate up again instead of reusing what it had.
    expect(fetch).toHaveBeenCalledTimes(3);

    await user.clear(screen.getByLabelText("Current mileage"));
    await user.type(screen.getByLabelText("Current mileage"), "40000");
    await user.click(screen.getByRole("button", { name: "Add car" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/cars/car",
        expect.objectContaining({ body: expect.stringContaining('"mayHavePriorHistory":true') })
      )
    );
  });

  it("submits the full real form state to /api/cars/car, and best-effort imports MOT history for the newly created car", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ car: { id: "new-car-1" } }))
      .mockResolvedValueOnce(jsonOk({}));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await fillRequired(user, { engineLitres: "1.6", year: "2020", registration: "AB12CDE", mileage: "40000" });
    await user.click(screen.getByRole("button", { name: "Add car" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenNthCalledWith(
        1,
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
      )
    );
    await waitFor(() =>
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        "/api/cars/car/mot-history",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ carId: "new-car-1" }) })
      )
    );
  });

  it("shows the car spinner on Add car while the submit request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Add car" }));

    const button = screen.getByRole("button", { name: "Adding…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch(jsonOk({ car: { id: "new-car-1" } }));
    await screen.findByRole("button", { name: "Add car" });
  });

  it("shows the server's own error when the API rejects the submit, without attempting the MOT import", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonErr({ error: "Something went wrong." }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("the mileage input's own min attribute (set from the real MOT floor) reflects the fetched figure", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: 12000, latestTestDate: "2025-01-01" }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(screen.getByLabelText("Current mileage")).toHaveValue(12000));

    expect(screen.getByLabelText("Current mileage")).toHaveAttribute("min", "12000");
  });

  it("requires the mileage-confirmation checkbox even when the entered figure matches the MOT floor exactly", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, fuelType: "PETROL", engineCapacityCc: 1596, plateInRetention: false, vehicleType: "four-wheeled" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: 12000, latestTestDate: "2025-01-01" }));

    const user = userEvent.setup();
    render(<AddCarForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(screen.getByLabelText("Current mileage")).toHaveValue(12000));

    await user.click(screen.getByRole("button", { name: "Add car" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please confirm the current mileage figure before adding the car."
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
