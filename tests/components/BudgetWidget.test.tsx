// Place at: tests/components/BudgetWidget.test.tsx
//
// Annual budget vs actual spend widget. Only fetch and next/navigation's
// useRouter (pulled in transitively via useTrackerFormSubmit) are mocked
// - the real ok/warning/over status thresholds and percentage math run
// for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BudgetWidget } from "@/app/dashboard/BudgetWidget";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";

function ForecastControls() {
  const { setForecastMode, setForecastWindow } = useChartFilter();
  return (
    <div>
      <button type="button" onClick={() => setForecastMode(true)}>enable forecast</button>
      <button type="button" onClick={() => setForecastMode(false)}>disable forecast</button>
      <button type="button" onClick={() => setForecastWindow("1m")}>window 1m</button>
      <button type="button" onClick={() => setForecastWindow("1y")}>window 1y</button>
    </div>
  );
}

describe("BudgetWidget", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("with no initial budget, starts in editing mode and submits the entered amount as annualBudget via PATCH", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BudgetWidget yearSpend={500} currentYear={2026} currency="GBP" rates={null} />);

    expect(screen.getByText(/No budget set for 2026 yet/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Annual budget (£)"), "2000");
    await user.click(screen.getByRole("button", { name: "Set budget" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ annualBudget: 2000 }) })
    );
  });

  it("PATCHes /api/cars/car instead of /api/tracker/bike when vehicleKind is 'car'", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<BudgetWidget yearSpend={500} currentYear={2026} currency="GBP" rates={null} vehicleKind="car" />);

    await user.type(screen.getByLabelText("Annual budget (£)"), "2000");
    await user.click(screen.getByRole("button", { name: "Set budget" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car", expect.objectContaining({ method: "PATCH" }));
  });

  it("shows the 'on track' status when spend is comfortably under budget", () => {
    render(<BudgetWidget yearSpend={400} currentYear={2026} initialBudget={2000} currency="GBP" rates={null} />);
    expect(screen.getByText("On track for 2026")).toBeInTheDocument();
    expect(screen.getByText("£400.00 of £2000.00")).toBeInTheDocument();
  });

  it("shows the 'approaching' warning once spend reaches 80% of budget", () => {
    render(<BudgetWidget yearSpend={1600} currentYear={2026} initialBudget={2000} currency="GBP" rates={null} />);
    expect(screen.getByText("Approaching your budget for 2026")).toBeInTheDocument();
  });

  it("shows the over-budget message with the exact overage amount once spend meets or exceeds budget", () => {
    render(<BudgetWidget yearSpend={2500} currentYear={2026} initialBudget={2000} currency="GBP" rates={null} />);
    expect(screen.getByText(/Over budget by £500/)).toBeInTheDocument();
  });

  it("'Change budget' returns to the editing form", async () => {
    const user = userEvent.setup();
    render(<BudgetWidget yearSpend={400} currentYear={2026} initialBudget={2000} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "Change budget" }));
    expect(screen.getByLabelText("Annual budget (£)")).toBeInTheDocument();
  });

  // vehicleKind is already threaded through as a prop here (see the
  // PATCHes-the-right-endpoint tests above), so the spinner just reads
  // that same prop rather than the dashboard's shared context.
  it("shows the bike spinner on 'Set budget' while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<BudgetWidget yearSpend={500} currentYear={2026} currency="GBP" rates={null} />);
    await user.type(screen.getByLabelText("Annual budget (£)"), "2000");
    await user.click(screen.getByRole("button", { name: "Set budget" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    expect(button.querySelectorAll("path").length).toBe(0); // bike wheel, not car

    resolveFetch({ ok: true, json: async () => ({}) });
    await waitFor(() => expect(screen.getByRole("button", { name: "Change budget" })).toBeInTheDocument());
  });

  it("shows the car spinner on 'Set budget' when vehicleKind is 'car'", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<BudgetWidget yearSpend={500} currentYear={2026} currency="GBP" rates={null} vehicleKind="car" />);
    await user.type(screen.getByLabelText("Annual budget (£)"), "2000");
    await user.click(screen.getByRole("button", { name: "Set budget" }));

    const button = screen.getByRole("button", { name: "Saving…" });
    expect(button.querySelectorAll("path").length).toBeGreaterThan(0); // car wheel

    resolveFetch({ ok: true, json: async () => ({}) });
  });

  // Forward-looking projection line, powered by summary.ts's
  // projectYearEndSpend - deliberately separate from the reactive
  // over/warning/ok status above it (see BudgetWidget.tsx's own comment).
  describe("year-end projection", () => {
    it("shows no projection line when yearEndProjection is omitted (too early in the year to trust one)", () => {
      render(<BudgetWidget yearSpend={400} currentYear={2026} initialBudget={2000} currency="GBP" rates={null} />);
      expect(screen.getByText("On track for 2026")).toBeInTheDocument();
      expect(screen.queryByText(/At this rate/)).not.toBeInTheDocument();
    });

    it("shows an under-budget projection alongside the 'on track' status", () => {
      render(
        <BudgetWidget
          yearSpend={400}
          currentYear={2026}
          initialBudget={2000}
          currency="GBP"
          rates={null}
          yearEndProjection={{ projected: 1200, daysElapsed: 100 }}
        />
      );
      expect(screen.getByText("On track for 2026")).toBeInTheDocument();
      expect(screen.getByText("At this rate, you'll finish 2026 about £800.00 under budget.")).toBeInTheDocument();
    });

    // The whole point of this line: it fires even while the reactive
    // status is still "ok" (spend so far is comfortably under budget),
    // catching a coming overspend before it's already happened.
    it("shows an over-budget projection even while the reactive status so far is still 'ok'", () => {
      render(
        <BudgetWidget
          yearSpend={400}
          currentYear={2026}
          initialBudget={2000}
          currency="GBP"
          rates={null}
          yearEndProjection={{ projected: 2500, daysElapsed: 60 }}
        />
      );
      expect(screen.getByText("On track for 2026")).toBeInTheDocument();
      expect(screen.getByText("At this rate, you'll go about £500.00 over budget by the end of 2026.")).toBeInTheDocument();
    });

    it("shows the projection line alongside the reactive over-budget status when both agree spend is already over", () => {
      render(
        <BudgetWidget
          yearSpend={2500}
          currentYear={2026}
          initialBudget={2000}
          currency="GBP"
          rates={null}
          yearEndProjection={{ projected: 3000, daysElapsed: 300 }}
        />
      );
      expect(screen.getByText(/Over budget by £500/)).toBeInTheDocument();
      expect(screen.getByText("At this rate, you'll go about £1000.00 over budget by the end of 2026.")).toBeInTheDocument();
    });
  });

  // "Future budget" - the same annual figure prorated down to the
  // selected window, compared against that window's own projected
  // spend rather than the real year-to-date figure (see
  // BudgetWidget.tsx's own comment).
  describe("forecast mode (Future budget)", () => {
    // £3650 annual budget = exactly £10/day, chosen so proration lands
    // on round numbers for every window (30-day month = £300, 182-day
    // half-year = £1820) without rounding noise in the assertions.
    const spendForecastByWindow = { "1w": 50, "1m": 250, "6m": 2000, "1y": 4000 } as const;

    it("renames the card to 'Future budget (window)', shows the Estimate badge, and compares projected spend against the prorated budget for the default 6-month window", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <BudgetWidget yearSpend={400} currentYear={2026} initialBudget={3650} currency="GBP" rates={null} spendForecastByWindow={spendForecastByWindow} />
        </ChartFilterProvider>
      );
      expect(screen.getByText("Annual budget (2026)")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.getByText("Future budget (Next 6 months)")).toBeInTheDocument();
      expect(screen.getByText("Estimate")).toBeInTheDocument();
      // £2000 projected spend of a £1820 prorated (182-day) budget - over by £180.
      expect(screen.getByText("£2000.00 of £1820.00")).toBeInTheDocument();
      expect(screen.getByText("⚠️ Projected to go £180.00 over your budget for the next 6 months")).toBeInTheDocument();
    });

    it("prorates down to a shorter window and reports 'approaching', not 'over', when the projected spend is under the prorated target", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <BudgetWidget yearSpend={400} currentYear={2026} initialBudget={3650} currency="GBP" rates={null} spendForecastByWindow={spendForecastByWindow} />
        </ChartFilterProvider>
      );
      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      await user.click(screen.getByRole("button", { name: "window 1m" }));

      expect(screen.getByText("Future budget (Next month)")).toBeInTheDocument();
      // £250 of a £300 (30-day) prorated budget = 83% - past the 80% warning threshold.
      expect(screen.getByText("£250.00 of £300.00")).toBeInTheDocument();
      expect(screen.getByText("Approaching your budget for the next month")).toBeInTheDocument();
    });

    it("uses the literal full annual amount for the '1 year' window, not an arithmetic proration of it", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <BudgetWidget yearSpend={400} currentYear={2026} initialBudget={3650} currency="GBP" rates={null} spendForecastByWindow={spendForecastByWindow} />
        </ChartFilterProvider>
      );
      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      await user.click(screen.getByRole("button", { name: "window 1y" }));

      expect(screen.getByText("£4000.00 of £3650.00")).toBeInTheDocument();
    });

    it("hides the year-end 'At this rate...' sentence while Forecast mode is on, even when a yearEndProjection is given", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <BudgetWidget
            yearSpend={400}
            currentYear={2026}
            initialBudget={3650}
            currency="GBP"
            rates={null}
            spendForecastByWindow={spendForecastByWindow}
            yearEndProjection={{ projected: 5000, daysElapsed: 100 }}
          />
        </ChartFilterProvider>
      );
      expect(screen.getByText(/At this rate/)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.queryByText(/At this rate/)).not.toBeInTheDocument();
    });

    it("switching back to Past restores the real annual view", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <BudgetWidget yearSpend={400} currentYear={2026} initialBudget={3650} currency="GBP" rates={null} spendForecastByWindow={spendForecastByWindow} />
        </ChartFilterProvider>
      );
      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      expect(screen.getByText("Future budget (Next 6 months)")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "disable forecast" }));

      expect(screen.getByText("Annual budget (2026)")).toBeInTheDocument();
      expect(screen.getByText("£400.00 of £3650.00")).toBeInTheDocument();
    });
  });
});
