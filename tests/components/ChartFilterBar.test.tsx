// Place at: tests/components/ChartFilterBar.test.tsx
//
// A real ChartFilterContext producer/consumer - renders inside a real
// ChartFilterProvider (see ChartFilterContext.test.tsx for the context's
// own direct tests) and checks that clicking a button both updates the
// active styling and the shared context state a sibling would see.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartFilterBar } from "@/app/dashboard/ChartFilterBar";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import styles from "@/app/dashboard/dashboard.module.css";

function RangeObserver() {
  const { range, viewBy } = useChartFilter();
  return <span>state:{range}/{viewBy}</span>;
}

function ForecastControls() {
  const { forecastMode, setForecastMode, forecastWindow } = useChartFilter();
  return (
    <div>
      <span>forecast:{String(forecastMode)}/{forecastWindow}</span>
      <button type="button" onClick={() => setForecastMode(true)}>enable forecast</button>
      <button type="button" onClick={() => setForecastMode(false)}>disable forecast</button>
    </div>
  );
}

describe("ChartFilterBar", () => {
  it("defaults to the All range and Time view-by, both marked active", () => {
    render(
      <ChartFilterProvider>
        <ChartFilterBar />
      </ChartFilterProvider>
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveClass(styles.rangeTabActive);
    expect(screen.getByRole("button", { name: "Time" })).toHaveClass(styles.rangeTabActive);
  });

  it("clicking a range option updates the shared context and the active styling", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ChartFilterBar />
        <RangeObserver />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Last 6 months" }));

    expect(screen.getByText("state:6m/time")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Last 6 months" })).toHaveClass(styles.rangeTabActive);
    expect(screen.getByRole("button", { name: "All" })).not.toHaveClass(styles.rangeTabActive);
  });

  it("clicking a view-by option updates the shared context independently of range", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ChartFilterBar />
        <RangeObserver />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "Mileage" }));

    expect(screen.getByText("state:all/mileage")).toBeInTheDocument();
  });

  // Forecast is always calendar-based, so the real Range/View-by
  // controls have nothing to filter while it's on - see
  // ChartFilterBar.tsx's own comment.
  describe("forecast window selector", () => {
    it("switching into Forecast mode hides Range/View by and shows the forecast window row instead, defaulting to 6 months", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ChartFilterBar />
          <ForecastControls />
        </ChartFilterProvider>
      );
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.queryByRole("button", { name: "All" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Time" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next 6 months" })).toHaveClass(styles.forecastWindowTabActive);
    });

    it("reuses the same pill styling as a real Range tab (.rangeTab), not a bespoke class", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ChartFilterBar />
          <ForecastControls />
        </ChartFilterProvider>
      );
      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      expect(screen.getByRole("button", { name: "Next week" })).toHaveClass(styles.rangeTab);
    });

    it("clicking a forecast window option updates the shared context and the active styling", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ChartFilterBar />
          <ForecastControls />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      await user.click(screen.getByRole("button", { name: "Next year" }));

      expect(screen.getByText("forecast:true/1y")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Next year" })).toHaveClass(styles.forecastWindowTabActive);
      expect(screen.getByRole("button", { name: "Next 6 months" })).not.toHaveClass(styles.forecastWindowTabActive);
    });

    it("switching back to Past restores Range/View by and hides the forecast window row", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ChartFilterBar />
          <ForecastControls />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      expect(screen.getByRole("button", { name: "Next week" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "disable forecast" }));
      expect(screen.queryByRole("button", { name: "Next week" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    });
  });
});
