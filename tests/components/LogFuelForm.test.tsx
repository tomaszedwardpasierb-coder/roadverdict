// Place at: tests/components/LogFuelForm.test.tsx
//
// "Log a fuel fill-up" - the form that feeds mpgCalc.ts's real MPG maths
// via `filledToFull`, and shares mileageCheck.ts (the single source of
// truth for mileage consistency) with the server-side validation. Only
// `fetch` and next/navigation's useRouter (via useTrackerFormSubmit) are
// mocked; the mileage-consistency and production-year checks run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { LogFuelForm } from "@/app/dashboard/LogFuelForm";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("LogFuelForm", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefills mileage from the bike's current mileage, converted into the display unit", () => {
    render(<LogFuelForm initialMileage={1000} mileageHistory={[]} distanceUnit="km" currency="GBP" rates={null} />);
    // 1000 miles -> ~1609 km, rounded
    expect(screen.getByLabelText(/Mileage at the time/)).toHaveValue(1609);
    expect(screen.getByLabelText(/Mileage at the time/)).toHaveAccessibleName("Mileage at the time (km)");
  });

  it("blocks submission when the claimed date is before the bike's own production year", async () => {
    const user = userEvent.setup();
    render(<LogFuelForm initialMileage={1000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} bikeYear={2021} />);
    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2019-01-01");

    expect(await screen.findByRole("alert")).toHaveTextContent(/before 2021/);
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("blocks outright a today-dated entry claiming less mileage than the bike currently has", async () => {
    const user = userEvent.setup();
    render(<LogFuelForm initialMileage={1000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    const mileageInput = screen.getByLabelText(/Mileage at the time/);
    await user.clear(mileageInput);
    await user.type(mileageInput, "500");

    expect(screen.getByText(/can't be lower than your bike's current recorded miles/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();
  });

  it("a past-dated entry that conflicts with logged history is a warning, not a block - and can be overridden by ticking 'this is correct'", async () => {
    const user = userEvent.setup();
    const history = [{ id: "h1", category: "service" as const, date: "2020-01-01", mileage: 2000 }];
    render(<LogFuelForm initialMileage={1000} mileageHistory={history} distanceUnit="mi" currency="GBP" rates={null} />);

    const dateInput = screen.getByLabelText("Date");
    await user.clear(dateInput);
    await user.type(dateInput, "2020-06-01");
    const mileageInput = screen.getByLabelText(/Mileage at the time/);
    await user.clear(mileageInput);
    await user.type(mileageInput, "500");

    expect(screen.getByText(/lower than an earlier entry on 1 Jan 2020/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Log it" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Yes, this mileage is correct" }));
    expect(screen.getByRole("button", { name: "Log it" })).not.toBeDisabled();
  });

  it("submits the real form state to /api/tracker/fuel, converting cost to GBP, then clears litres/cost but leaves mileage and date alone", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogFuelForm initialMileage={1000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.type(screen.getByLabelText("Litres added"), "10");
    await user.type(screen.getByLabelText(/Cost paid/), "15");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/fuel",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ litres: 10, cost: 15, mileage: 1000, date: todayStr(), filledToFull: true, mileageAcknowledged: false }),
      })
    );
    await waitFor(() => expect(screen.getByLabelText("Litres added")).toHaveValue(null));
    expect(screen.getByLabelText(/Cost paid/)).toHaveValue(null);
    expect(screen.getByLabelText(/Mileage at the time/)).toHaveValue(1000);
  });

  it("unticking 'filled the tank completely full' is reflected in the submitted body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<LogFuelForm initialMileage={1000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    await user.click(screen.getByRole("checkbox", { name: "Filled the tank completely full" }));
    await user.type(screen.getByLabelText("Litres added"), "5");
    await user.type(screen.getByLabelText(/Cost paid/), "8");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/fuel",
      expect.objectContaining({
        body: JSON.stringify({ litres: 5, cost: 8, mileage: 1000, date: todayStr(), filledToFull: false, mileageAcknowledged: false }),
      })
    );
  });

  it("offers a receipt/invoice attachment field", () => {
    render(<LogFuelForm initialMileage={1000} mileageHistory={[]} distanceUnit="mi" currency="GBP" rates={null} />);
    expect(screen.getByLabelText("Receipt or invoice (optional)")).toBeInTheDocument();
  });
});
