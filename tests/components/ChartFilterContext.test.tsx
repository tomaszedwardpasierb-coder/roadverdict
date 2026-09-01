// Place at: tests/components/ChartFilterContext.test.tsx
//
// The third of the three shared dashboard contexts (see also
// TabSwitchContext.test.tsx and ScannedReceiptContext.test.tsx).
// ChartFilterBar.test.tsx exercises this indirectly through its real
// consumer; this file covers the Provider/hook pair directly, including
// its defaults and its no-provider fallback.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";

function Consumer() {
  const { range, setRange, viewBy, setViewBy } = useChartFilter();
  return (
    <div>
      <span>range:{range}</span>
      <span>viewBy:{viewBy}</span>
      <button onClick={() => setRange("1m")}>set range</button>
      <button onClick={() => setViewBy("mileage")}>set viewBy</button>
    </div>
  );
}

describe("useChartFilter (no provider)", () => {
  it("falls back to range=all/viewBy=time and safe no-op setters instead of throwing", () => {
    render(<Consumer />);
    expect(screen.getByText("range:all")).toBeInTheDocument();
    expect(screen.getByText("viewBy:time")).toBeInTheDocument();
    expect(() => screen.getByRole("button", { name: "set range" }).click()).not.toThrow();
  });
});

describe("ChartFilterProvider", () => {
  it("defaults to all/time and updates real state via the setters", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <Consumer />
      </ChartFilterProvider>
    );
    expect(screen.getByText("range:all")).toBeInTheDocument();
    expect(screen.getByText("viewBy:time")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "set range" }));
    expect(screen.getByText("range:1m")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "set viewBy" }));
    expect(screen.getByText("viewBy:mileage")).toBeInTheDocument();
  });
});
