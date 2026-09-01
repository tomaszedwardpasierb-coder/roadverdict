// Place at: tests/components/BudgetWidget.test.tsx
//
// Annual budget vs actual spend widget. Only fetch and next/navigation's
// useRouter (pulled in transitively via useTrackerFormSubmit) are mocked
// - the real ok/warning/over status thresholds and percentage math run
// for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BudgetWidget } from "@/app/dashboard/BudgetWidget";

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

  it("shows the 'on track' status when spend is comfortably under budget", () => {
    render(<BudgetWidget yearSpend={400} currentYear={2026} initialBudget={2000} currency="GBP" rates={null} />);
    expect(screen.getByText("On track for 2026")).toBeInTheDocument();
    expect(screen.getByText("£400 of £2000")).toBeInTheDocument();
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
});
