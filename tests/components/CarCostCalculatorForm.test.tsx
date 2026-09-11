// Place at: tests/components/CarCostCalculatorForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarCostCalculatorForm } from "@/components/CarCostCalculatorForm";

describe("CarCostCalculatorForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all three steps with their default selections", () => {
    render(<CarCostCalculatorForm signedIn={false} />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("abarth");
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
    expect(screen.getByLabelText("Fuel type")).toHaveValue("petrol");
  });

  it("shows a sell description before any lookup, tailored to signed-in vs anonymous", () => {
    const { unmount } = render(<CarCostCalculatorForm signedIn />);
    expect(screen.getByText(/see what this car actually costs to run per year/)).toBeInTheDocument();
    unmount();

    render(<CarCostCalculatorForm signedIn={false} />);
    expect(screen.getByText(/Sign in to search by registration/)).toBeInTheDocument();
    expect(screen.getByText(/fuel, tax, maintenance/)).toBeInTheDocument();
  });

  it("submits the real form state, including an entered CO2 figure, to /api/cars/cost-calculator", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        breakdown: { servicing: 250, tyres: 40, mot: 37, tax: 200, fuel: 1000, total: 1527, vedUnknown: false, vedCaveat: "caveat text" },
        brandLabel: "Ford",
        regionLabel: "Rest of England & Wales",
      }),
    });

    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={false} />);
    await user.selectOptions(screen.getByLabelText("Make"), "ford");
    await user.clear(screen.getByLabelText("Typical miles per year"));
    await user.type(screen.getByLabelText("Typical miles per year"), "7000");
    await user.type(screen.getByLabelText(/CO2 emissions/), "120");
    await user.click(screen.getByRole("button", { name: "Work it out" }));

    expect(await screen.findByText("£1527")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/cost-calculator",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          carClass: "medium",
          brand: "ford",
          region: "rest-england-wales",
          fuelType: "petrol",
          annualMileage: 7000,
          co2Gkm: 120,
        }),
      })
    );
  });

  it("submits co2Gkm as undefined when the field is left blank", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        breakdown: { servicing: 250, tyres: 40, mot: 37, tax: 0, fuel: 1000, total: 1327, vedUnknown: true, vedCaveat: "caveat text" },
        brandLabel: "Ford",
        regionLabel: "Rest of England & Wales",
      }),
    });

    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "Work it out" }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.co2Gkm).toBeUndefined();
  });

  it("shows the server's own error message when the API responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Something specific went wrong server-side." }),
    });

    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "Work it out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong server-side.");
  });

  it("signed out: clicking plate lookup shows a sign-in prompt instead of calling fetch", async () => {
    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={false} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/sign in here/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signed in: a found electric car leaves the fuel type on a petrol-equivalent estimate with an explanatory note", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Tesla",
        model: "Model 3",
        fuelType: "ELECTRICITY",
        colour: "White",
        plateInRetention: false,
        motDueDate: null,
        motTests: [],
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/electric running costs aren.t supported/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Fuel type")).toHaveValue("petrol"); // left on the default, not switched to an unsupported option
  });

  it("signed in: a found diesel car updates the fuel type field", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        fuelType: "DIESEL",
        colour: "Silver",
        plateInRetention: false,
        motDueDate: "2026-01-01",
        motTests: [],
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Fuel type")).toHaveValue("diesel"));
    // Car size can no longer be auto-filled from this lookup at all -
    // left untouched on its default.
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
  });

  // The explicit "that's a motorcycle, not a car" rejection no longer
  // exists - MotHistoryDetails has no body-type field to classify
  // vehicle kind from. A mismatched vehicle just resolves to "other"
  // brand rather than being rejected outright.
  it("signed in: a motorcycle's plate (no matching car brand) resolves to 'other' rather than being rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Yamaha",
        model: "MT-07",
        fuelType: "PETROL",
        colour: "Blue",
        plateInRetention: false,
        motDueDate: "2026-06-01",
        motTests: [],
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarCostCalculatorForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("other"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
