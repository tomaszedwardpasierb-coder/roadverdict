// Place at: tests/components/AddBikeForm.test.tsx
//
// AddBikeForm mirrors the public QuoteForm/CostCalculatorForm's plate-lookup
// pattern, but adds two things those don't have: an MOT-based mileage floor
// pulled from a second endpoint, and the tracker-specific duplicate-
// registration flow (bike-exists -> "go to this bike" / "request ownership" /
// "start fresh"). Only fetch and next/navigation's useRouter are mocked
// (both AddBikeForm itself and useTrackerFormSubmit call useRouter) -
// everything else (React state, the real make/model lists, the real
// MOT-mileage-floor validation) runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { AddBikeForm } from "@/app/dashboard/AddBikeForm";

function jsonOk(data: unknown) {
  return { ok: true, json: async () => data };
}
function jsonErr(data: unknown) {
  return { ok: false, json: async () => data };
}

async function fillYearAndMileage(user: ReturnType<typeof userEvent.setup>, { year = "2020", mileage = "5000" } = {}) {
  const yearInput = screen.queryByLabelText("Year") as HTMLInputElement | null;
  if (yearInput) {
    await user.clear(yearInput);
    await user.type(yearInput, year);
  }
  const mileageInput = screen.getByLabelText("Current mileage") as HTMLInputElement;
  await user.clear(mileageInput);
  await user.type(mileageInput, mileage);
}

describe("AddBikeForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the first curated brand/model selected by default, with the year field visible", () => {
    render(<AddBikeForm />);
    expect(screen.getByLabelText("Make")).toHaveValue("Aprilia");
    expect(screen.getByLabelText("Model")).toHaveValue("RS125");
    expect(screen.getByLabelText("Year")).toBeInTheDocument();
    expect(screen.getByLabelText("Year")).toBeRequired();
  });

  it("checking 'custom build' hides the year field", async () => {
    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.click(screen.getByLabelText(/custom build/i));
    expect(screen.queryByLabelText("Year")).not.toBeInTheDocument();
  });

  it("picking 'Other / not in this list' for the make skips straight to custom make + custom model + custom engine-size fields", async () => {
    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.selectOptions(screen.getByLabelText("Make"), "__other__");
    expect(screen.getByLabelText("Make (enter manually)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Model")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Model (enter manually)")).toBeInTheDocument();
    expect(screen.getByLabelText("Engine size (cc)")).toBeInTheDocument();
  });

  it("rejects a custom model with no valid engine size, without ever calling fetch", async () => {
    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.selectOptions(screen.getByLabelText("Model"), "__other__");
    await user.type(screen.getByLabelText("Model (enter manually)"), "Custom Special");
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await fillYearAndMileage(user);
    await user.click(screen.getByRole("button", { name: "Add bike" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid engine size in cc.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("look up: an empty registration is refused before any fetch call", async () => {
    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.click(screen.getByRole("button", { name: "Look up" }));
    expect(await screen.findByText("Enter a registration number first.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("look up: a four-wheeled result is refused with the specific message and never checks for duplicates", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonOk({ vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2020, engineCapacityCc: null, plateInRetention: false, vehicleType: "four-wheeled" })
    );
    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/four wheels/i);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("look up: an 'unknown' vehicle type asks for manual entry instead of guessing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonOk({ vrm: "AB12CDE", make: null, model: null, year: null, engineCapacityCc: null, plateInRetention: false, vehicleType: "unknown" })
    );
    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/double-check the registration number/i);
  });

  it("look up: a matched make and model auto-fills the form and pulls in the real MOT mileage floor", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Yamaha", model: "MT-07", year: 2022, engineCapacityCc: 689, plateInRetention: false, vehicleType: "motorcycle" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: 12000, latestTestDate: "2025-01-01" }));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("Yamaha"));
    expect(screen.getByLabelText("Model")).toHaveValue("MT-07");
    expect(screen.getByLabelText("Year")).toHaveValue(2022);
    expect(screen.getByText(/Matched to Yamaha MT-07 in our list\./)).toBeInTheDocument();
    expect(screen.getByLabelText("Current mileage")).toHaveValue(12000);
    expect(screen.getByText(/recorded 12,000 miles/)).toBeInTheDocument();
    expect(screen.getByLabelText(/I confirm this mileage is correct/)).toBeInTheDocument();
  });

  it("look up: a duplicate already on this account offers to switch straight to it", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Yamaha", model: "MT-07", year: 2022, engineCapacityCc: 689, plateInRetention: false, vehicleType: "motorcycle" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: true, bikeId: "bike-42" }))
      .mockResolvedValueOnce(jsonOk({}));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already added this bike/i)).toBeInTheDocument();
    // The lookup data was never applied, since bike-exists short-circuited before it.
    expect(screen.getByLabelText("Make")).toHaveValue("Aprilia");

    await user.click(screen.getByRole("button", { name: "Go to this bike" }));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/dashboard"));
    expect(mockRouter.refresh).toHaveBeenCalled();
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracker/active-bike",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ bikeId: "bike-42" }) })
    );
  });

  it("look up: a duplicate on someone else's account offers request-ownership, which reports the server's own error on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Yamaha", model: "MT-07", year: 2022, engineCapacityCc: 689, plateInRetention: false, vehicleType: "motorcycle" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: false }))
      .mockResolvedValueOnce(jsonErr({ error: "Ownership requests are limited to 3 per day." }));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already has a RoadVerdict history/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Request ownership" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Ownership requests are limited to 3 per day.");
    expect(fetch).toHaveBeenLastCalledWith(
      "/api/tracker/bike-transfer/request-ownership",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ registration: "AB12CDE" }) })
    );
  });

  it("look up: 'start fresh' on a duplicate applies the held lookup data without a second network round-trip, and flags the eventual submit as mayHavePriorHistory", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Yamaha", model: "MT-07", year: 2022, engineCapacityCc: 689, plateInRetention: false, vehicleType: "motorcycle" }))
      .mockResolvedValueOnce(jsonOk({ exists: true, belongsToCurrentUser: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: null }))
      .mockResolvedValueOnce(jsonOk({ bike: { id: "new-bike-1" } }))
      .mockResolvedValueOnce(jsonOk({}));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await screen.findByText(/already has a RoadVerdict history/i);

    await user.click(screen.getByRole("button", { name: "Start fresh, without requesting" }));
    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("Yamaha"));
    // Calls so far: plate-lookup, bike-exists, then the mot-history-preview
    // that applyLookupData made on the already-held data - a 4th call would
    // mean it looked the plate up again instead of reusing what it had.
    expect(fetch).toHaveBeenCalledTimes(3);

    await fillYearAndMileage(user, { mileage: "5000" });
    await user.click(screen.getByRole("button", { name: "Add bike" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/tracker/bike",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"mayHavePriorHistory":true'),
        })
      )
    );
  });

  it("submits the full real form state to /api/tracker/bike, and best-effort imports MOT history for the newly created bike", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ bike: { id: "new-bike-1" } }))
      .mockResolvedValueOnce(jsonOk({}));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await fillYearAndMileage(user, { year: "2020", mileage: "3000" });
    await user.click(screen.getByRole("button", { name: "Add bike" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        "/api/tracker/bike",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            make: "Aprilia",
            model: "RS125",
            engineCC: 124,
            year: 2020,
            isCustomBuild: false,
            registration: "AB12CDE",
            currentMileage: 3000,
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
        "/api/tracker/mot-history",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ bikeId: "new-bike-1" }) })
      )
    );
  });

  it("shows the server's own free-tier-limit message when the API rejects the submit, without attempting the MOT import", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      jsonErr({ error: "You've reached the free plan's limit of 1 tracked bike. Upgrade to add more." })
    );

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await fillYearAndMileage(user, { year: "2020", mileage: "3000" });
    await user.click(screen.getByRole("button", { name: "Add bike" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You've reached the free plan's limit of 1 tracked bike. Upgrade to add more."
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("the mileage input's own min attribute (set from the real MOT floor) blocks a browser submit below it before handleSubmit's own same-purpose check ever runs", async () => {
    // handleSubmit's own `mileage < minMileage` guard is defense in depth,
    // same reasoning as QuoteForm's own min/required test: once a lookup
    // sets minMileage, the input's min attribute is driven from that exact
    // number, so the browser itself (not React) refuses to fire "submit"
    // for anything lower - reachable only by asserting the constraint
    // exists, not by faking a submit past it.
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Yamaha", model: "MT-07", year: 2022, engineCapacityCc: 689, plateInRetention: false, vehicleType: "motorcycle" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: 12000, latestTestDate: "2025-01-01" }));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(screen.getByLabelText("Current mileage")).toHaveValue(12000));

    expect(screen.getByLabelText("Current mileage")).toHaveAttribute("min", "12000");
  });

  it("requires the mileage-confirmation checkbox even when the entered figure matches the MOT floor exactly", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ vrm: "AB12CDE", make: "Yamaha", model: "MT-07", year: 2022, engineCapacityCc: 689, plateInRetention: false, vehicleType: "motorcycle" }))
      .mockResolvedValueOnce(jsonOk({ exists: false }))
      .mockResolvedValueOnce(jsonOk({ latestTrustedMileage: 12000, latestTestDate: "2025-01-01" }));

    const user = userEvent.setup();
    render(<AddBikeForm />);
    await user.type(screen.getByLabelText("Registration number"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(screen.getByLabelText("Current mileage")).toHaveValue(12000));

    await user.click(screen.getByRole("button", { name: "Add bike" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Please confirm the current mileage figure before adding the bike."
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
