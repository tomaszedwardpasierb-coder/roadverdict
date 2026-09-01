// Place at: tests/components/CostCalculatorForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CostCalculatorForm } from "@/components/CostCalculatorForm";

describe("CostCalculatorForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("picking a real model from the curated list overrides the engine-size class it implies", async () => {
    const user = userEvent.setup();
    render(<CostCalculatorForm signedIn={false} />);

    expect(screen.getByLabelText("Engine size")).toHaveValue("medium");
    await user.selectOptions(screen.getByLabelText("Model"), "CB125R");

    // Once a model is picked, the plain engine-size <select> is replaced
    // by a read-only note derived from that model's real cc figure.
    expect(screen.queryByLabelText("Engine size")).not.toBeInTheDocument();
    expect(screen.getByText(/Small \(up to 400cc\).*from CB125R/)).toBeInTheDocument();
  });

  it("switching brand resets the model back to unset", async () => {
    const user = userEvent.setup();
    render(<CostCalculatorForm signedIn={false} />);

    await user.selectOptions(screen.getByLabelText("Model"), "CB125R");
    await user.selectOptions(screen.getByLabelText("Make"), "yamaha");

    expect(screen.getByLabelText("Model")).toHaveValue("");
    expect(screen.getByLabelText("Engine size")).toBeInTheDocument(); // the picker is back
  });

  it("submits real form state to /api/cost-calculator and renders the breakdown", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        breakdown: { servicing: 150, tyres: 100, mot: 30, tax: 40, fuel: 300, total: 620 },
        brandLabel: "Honda",
        regionLabel: "Rest of England & Wales",
        advice: null,
      }),
    });

    const user = userEvent.setup();
    render(<CostCalculatorForm signedIn={false} />);
    await user.clear(screen.getByLabelText("Typical miles per year"));
    await user.type(screen.getByLabelText("Typical miles per year"), "6000");
    await user.click(screen.getByRole("button", { name: "Work it out" }));

    expect(await screen.findByText("£620")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cost-calculator",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bikeClass: "medium", brand: "honda", region: "rest-england-wales", annualMileage: 6000 }),
      })
    );
  });

  it("signed in: a matched plate result fills brand, model, and engine size from the real lookup data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Honda",
        model: "CB125R",
        year: 2021,
        engineCapacityCc: 125,
        plateInRetention: false,
        vehicleType: "motorcycle",
      }),
    });

    const user = userEvent.setup();
    render(<CostCalculatorForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue("CB125R"));
    expect(screen.getByText(/Small \(up to 400cc\)/)).toBeInTheDocument();
  });

  it("rejects a mileage of exactly zero client-side - passes the input's own min=0 but fails the mileage<=0 guard", async () => {
    // min="0" alone treats 0 as a valid HTML number, so this is a real,
    // reachable path through the rendered form's own constraints, unlike
    // a genuinely out-of-range value which the input itself would block.
    const user = userEvent.setup();
    render(<CostCalculatorForm signedIn={false} />);
    await user.clear(screen.getByLabelText("Typical miles per year"));
    await user.type(screen.getByLabelText("Typical miles per year"), "0");
    await user.click(screen.getByRole("button", { name: "Work it out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/enter your typical annual mileage/i);
    expect(fetch).not.toHaveBeenCalled();
  });
});
