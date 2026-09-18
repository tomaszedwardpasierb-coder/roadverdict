// Place at: tests/components/ForecastToggle.test.tsx
//
// A real ChartFilterContext producer/consumer, same pattern as
// ChartFilterBar.test.tsx - renders inside a real ChartFilterProvider and
// checks that clicking a button both updates the active styling and the
// shared context state a sibling (CategorySpendChart) would see. Just
// the Past/Forecast switch itself - the window selector (Next
// week/month/6 months/year) now lives in ChartFilterBar.tsx, reusing the
// real Range bar's own component pattern, and is tested there.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastToggle } from "@/app/dashboard/ForecastToggle";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import styles from "@/app/dashboard/dashboard.module.css";

function ForecastObserver() {
  const { forecastMode } = useChartFilter();
  return <span>state:{String(forecastMode)}</span>;
}

describe("ForecastToggle", () => {
  it("defaults to Past active", () => {
    render(
      <ChartFilterProvider>
        <ForecastToggle />
      </ChartFilterProvider>
    );
    expect(screen.getByRole("button", { name: "Past" })).toHaveClass(styles.forecastToggleBtnActive);
    expect(screen.getByRole("button", { name: "Forecast" })).not.toHaveClass(styles.forecastToggleBtnActive);
  });

  it("clicking Forecast switches the shared context into forecast mode", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ForecastToggle />
        <ForecastObserver />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Forecast" }));

    expect(screen.getByText("state:true")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forecast" })).toHaveClass(styles.forecastToggleBtnActive);
    expect(screen.getByRole("button", { name: "Past" })).not.toHaveClass(styles.forecastToggleBtnActive);
  });

  it("clicking back to Past switches the shared context back", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ForecastToggle />
        <ForecastObserver />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Forecast" }));
    await user.click(screen.getByRole("button", { name: "Past" }));

    expect(screen.getByText("state:false")).toBeInTheDocument();
  });
});
