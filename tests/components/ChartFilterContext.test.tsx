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
  const { range, setRange, viewBy, setViewBy, forecastMode, setForecastMode, forecastWindow, setForecastWindow } = useChartFilter();
  return (
    <div>
      <span>range:{range}</span>
      <span>viewBy:{viewBy}</span>
      <span>forecastMode:{String(forecastMode)}</span>
      <span>forecastWindow:{forecastWindow}</span>
      <button onClick={() => setRange("1m")}>set range</button>
      <button onClick={() => setViewBy("mileage")}>set viewBy</button>
      <button onClick={() => setForecastMode(true)}>set forecastMode</button>
      <button onClick={() => setForecastWindow("1y")}>set forecastWindow</button>
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

  // forecastMode always starts false and forecastWindow defaults to 6m -
  // see ChartFilterContext.tsx's own comment on why forecast is never
  // persisted or remembered between visits.
  it("falls back to forecastMode=false/forecastWindow=6m and safe no-op setters instead of throwing", () => {
    render(<Consumer />);
    expect(screen.getByText("forecastMode:false")).toBeInTheDocument();
    expect(screen.getByText("forecastWindow:6m")).toBeInTheDocument();
    expect(() => screen.getByRole("button", { name: "set forecastMode" }).click()).not.toThrow();
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

  it("defaults to forecastMode=false/forecastWindow=6m and updates real state via the setters", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <Consumer />
      </ChartFilterProvider>
    );
    expect(screen.getByText("forecastMode:false")).toBeInTheDocument();
    expect(screen.getByText("forecastWindow:6m")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "set forecastMode" }));
    expect(screen.getByText("forecastMode:true")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "set forecastWindow" }));
    expect(screen.getByText("forecastWindow:1y")).toBeInTheDocument();
  });
});
