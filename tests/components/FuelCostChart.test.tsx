// Place at: tests/components/FuelCostChart.test.tsx
//
// jsdom has no real canvas, so react-chartjs-2's <Line>/<Bar> are mocked
// out entirely - what's asserted here is the real data/options this
// component hands them (sorting, currency conversion, the point-click ->
// tab-switch wiring shared with MileageChart), not chart.js's own
// rendering. ChartFilterContext and TabSwitchContext both have safe
// no-Provider fallbacks (asserted directly in the "no points" case);
// specific tests below wrap in a real Provider where the behaviour under
// test needs one.
import { useEffect, act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const chartProps = vi.hoisted(() => ({ Line: null as any, Bar: null as any }));
vi.mock("react-chartjs-2", () => ({
  Line: (props: unknown) => {
    chartProps.Line = props;
    return null;
  },
  Bar: (props: unknown) => {
    chartProps.Bar = props;
    return null;
  },
}));

import { FuelCostChart } from "@/app/dashboard/FuelCostChart";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import { TabSwitchProvider, useTabSwitch } from "@/app/dashboard/TabSwitchContext";

function SetViewBy({ value }: { value: "time" | "mileage" }) {
  const { setViewBy } = useChartFilter();
  useEffect(() => {
    setViewBy(value);
  }, [value, setViewBy]);
  return null;
}

function HighlightProbe() {
  const { highlightIds } = useTabSwitch();
  return <p>Highlighted: {highlightIds.join(",") || "none"}</p>;
}

const points = [
  { id: "a", date: "2026-01-01", cost: 10, mileage: 300 },
  { id: "b", date: "2026-02-01", cost: 20, mileage: 100 },
];

describe("FuelCostChart", () => {
  beforeEach(() => {
    chartProps.Line = null;
    chartProps.Bar = null;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty note and renders no chart when there are no points", () => {
    render(<FuelCostChart points={[]} currency="GBP" rates={null} distanceUnit="mi" />);
    expect(screen.getByText("No fuel fill-ups logged in this time range.")).toBeInTheDocument();
    expect(chartProps.Line).toBeNull();
  });

  it("sorts points by date, and hands the Line chart currency-converted costs with a £ tooltip/axis format", () => {
    render(<FuelCostChart points={points} currency="GBP" rates={null} distanceUnit="mi" />);
    expect(chartProps.Line.data.labels).toEqual(["1 Jan 2026", "1 Feb 2026"]);
    expect(chartProps.Line.data.datasets[0].data).toEqual([10, 20]);
    expect(chartProps.Line.options.scales.y.ticks.callback(5)).toBe("£5");
    expect(chartProps.Line.options.plugins.tooltip.callbacks.label({ parsed: { y: 12.5 } })).toBe("£12.50");
  });

  it('sorts by mileage instead of date once the shared ChartFilterContext viewBy is "mileage"', () => {
    render(
      <ChartFilterProvider>
        <SetViewBy value="mileage" />
        <FuelCostChart points={points} currency="GBP" rates={null} distanceUnit="mi" />
      </ChartFilterProvider>
    );
    // point "b" has the lower mileage (100) despite the later date, so it sorts first
    expect(chartProps.Line.data.labels).toEqual(["100 miles", "300 miles"]);
    expect(chartProps.Line.data.datasets[0].data).toEqual([20, 10]);
  });

  it("switching to the bar chart hands Bar the same values and persists the choice via PATCH to /api/tracker/bike", async () => {
    const user = userEvent.setup();
    render(<FuelCostChart points={points} currency="GBP" rates={null} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Bar" }));

    expect(chartProps.Bar.data.labels).toEqual(["1 Jan 2026", "1 Feb 2026"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ chartType: { chartId: "fuel-cost", kind: "bar" } }),
      })
    );
  });

  it("clicking a point switches to the fuel tab and highlights that exact record's id, via TabSwitchContext", () => {
    const onSwitchTab = vi.fn();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <FuelCostChart points={points} currency="GBP" rates={null} distanceUnit="mi" />
        <HighlightProbe />
      </TabSwitchProvider>
    );
    expect(screen.getByText("Highlighted: none")).toBeInTheDocument();

    act(() => {
      chartProps.Line.options.onClick(null, [{ index: 0 }]);
    });

    expect(onSwitchTab).toHaveBeenCalledWith("fuel");
    expect(screen.getByText("Highlighted: a")).toBeInTheDocument();
  });

  it("onHover sets the pointer cursor only while actually over a point", () => {
    render(<FuelCostChart points={points} currency="GBP" rates={null} distanceUnit="mi" />);
    const target = document.createElement("div");
    chartProps.Line.options.onHover({ native: { target } }, [{}]);
    expect(target.style.cursor).toBe("pointer");
    chartProps.Line.options.onHover({ native: { target } }, []);
    expect(target.style.cursor).toBe("default");
  });
});
