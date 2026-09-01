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
});
