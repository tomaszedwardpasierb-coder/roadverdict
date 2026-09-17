// Place at: tests/components/ForecastToggle.test.tsx
//
// A real ChartFilterContext producer/consumer, same pattern as
// ChartFilterBar.test.tsx - renders inside a real ChartFilterProvider and
// checks that clicking a button both updates the active styling and the
// shared context state a sibling (CategorySpendChart) would see.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastToggle } from "@/app/dashboard/ForecastToggle";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import styles from "@/app/dashboard/dashboard.module.css";

function ForecastObserver() {
  const { forecastMode, forecastWindow } = useChartFilter();
  return <span>state:{String(forecastMode)}/{forecastWindow}</span>;
}

describe("ForecastToggle", () => {
  it("defaults to Past active, with no window selector shown", () => {
    render(
      <ChartFilterProvider>
        <ForecastToggle />
      </ChartFilterProvider>
    );
    expect(screen.getByRole("button", { name: "Past" })).toHaveClass(styles.forecastToggleBtnActive);
    expect(screen.getByRole("button", { name: "Forecast" })).not.toHaveClass(styles.forecastToggleBtnActive);
    expect(screen.queryByRole("button", { name: "6 months" })).not.toBeInTheDocument();
  });

  it("clicking Forecast switches the shared context into forecast mode and reveals the window selector, defaulting to 6 months", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ForecastToggle />
        <ForecastObserver />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Forecast" }));

    expect(screen.getByText("state:true/6m")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Forecast" })).toHaveClass(styles.forecastToggleBtnActive);
    expect(screen.getByRole("button", { name: "6 months" })).toHaveClass(styles.forecastWindowTabActive);
  });

  it("clicking a window option updates the shared context independently of the Past/Forecast toggle", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ForecastToggle />
        <ForecastObserver />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Forecast" }));
    await user.click(screen.getByRole("button", { name: "1 year" }));

    expect(screen.getByText("state:true/1y")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 year" })).toHaveClass(styles.forecastWindowTabActive);
    expect(screen.getByRole("button", { name: "6 months" })).not.toHaveClass(styles.forecastWindowTabActive);
  });

  it("clicking back to Past hides the window selector again", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ForecastToggle />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Forecast" }));
    expect(screen.getByRole("button", { name: "6 months" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Past" }));
    expect(screen.queryByRole("button", { name: "6 months" })).not.toBeInTheDocument();
  });
});
