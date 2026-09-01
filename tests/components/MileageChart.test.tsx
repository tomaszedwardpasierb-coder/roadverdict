// Place at: tests/components/MileageChart.test.tsx
//
// Same react-chartjs-2 mocking approach as FuelCostChart.test.tsx (no
// real canvas in jsdom). The one behaviour genuinely specific to this
// chart is the click-through category remap: MOT-derived points aren't
// their own dashboard tab, they live under "bills" - exercised directly
// below rather than assumed from the source comment.
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

import { MileageChart } from "@/app/dashboard/MileageChart";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import { TabSwitchProvider, useTabSwitch } from "@/app/dashboard/TabSwitchContext";

function SetRange({ value }: { value: "all" | "1w" }) {
  const { setRange } = useChartFilter();
  useEffect(() => {
    setRange(value);
  }, [value, setRange]);
  return null;
}

function HighlightProbe() {
  const { highlightIds } = useTabSwitch();
  return <p>Highlighted: {highlightIds.join(",") || "none"}</p>;
}

const points = [
  { id: "a", date: "2026-01-01", mileage: 1000, category: "service" as const },
  { id: "b", date: "2026-02-01", mileage: 1200, category: "mot" as const },
];

describe("MileageChart", () => {
  beforeEach(() => {
    chartProps.Line = null;
    chartProps.Bar = null;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an empty note (not a one-point chart) when there are fewer than 2 points in range", () => {
    render(<MileageChart points={[points[0]]} distanceUnit="mi" />);
    expect(screen.getByText("No entries logged in this time range.")).toBeInTheDocument();
    expect(chartProps.Line).toBeNull();
  });

  it("titles itself and labels its axis by distance unit, converting miles to km when asked", () => {
    render(<MileageChart points={points} distanceUnit="km" />);
    expect(screen.getByText("Kilometres over time")).toBeInTheDocument();
    // 1000mi -> 1609km, 1200mi -> 1931km, both rounded
    expect(chartProps.Line.data.datasets[0].data).toEqual([1609, 1931]);
    expect(chartProps.Line.options.scales.y.title).toEqual({ display: true, text: "km" });
  });

  it("keeps plain mileage labelling (no conversion) for distanceUnit 'mi'", () => {
    render(<MileageChart points={points} distanceUnit="mi" />);
    expect(screen.getByText("Mileage over time")).toBeInTheDocument();
    expect(chartProps.Line.data.datasets[0].data).toEqual([1000, 1200]);
  });

  it("switching to the bar chart hands Bar the same values and persists the choice for chartId 'mileage'", async () => {
    const user = userEvent.setup();
    render(<MileageChart points={points} distanceUnit="mi" />);
    await user.click(screen.getByRole("button", { name: "Bar" }));

    expect(chartProps.Bar.data.datasets[0].data).toEqual([1000, 1200]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ chartType: { chartId: "mileage", kind: "bar" } }),
      })
    );
  });

  it("clicking a plain service point routes to the 'service' tab and highlights its id", () => {
    const onSwitchTab = vi.fn();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <MileageChart points={points} distanceUnit="mi" />
        <HighlightProbe />
      </TabSwitchProvider>
    );
    act(() => {
      chartProps.Line.options.onClick(null, [{ index: 0 }]);
    });
    expect(onSwitchTab).toHaveBeenCalledWith("service");
    expect(screen.getByText("Highlighted: a")).toBeInTheDocument();
  });

  it("clicking a MOT-derived point routes to 'bills', not a nonexistent 'mot' tab", () => {
    const onSwitchTab = vi.fn();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <MileageChart points={points} distanceUnit="mi" />
        <HighlightProbe />
      </TabSwitchProvider>
    );
    act(() => {
      chartProps.Line.options.onClick(null, [{ index: 1 }]);
    });
    expect(onSwitchTab).toHaveBeenCalledWith("bills");
    expect(screen.getByText("Highlighted: b")).toBeInTheDocument();
  });

  it("respects the shared ChartFilterContext date range, dropping out-of-range points", () => {
    const farPast = { id: "old", date: "2000-01-01", mileage: 100, category: "service" as const };
    const recent = { id: "new", date: new Date().toISOString().slice(0, 10), mileage: 5000, category: "service" as const };
    render(
      <ChartFilterProvider>
        <SetRange value="1w" />
        <MileageChart points={[farPast, recent]} distanceUnit="mi" />
      </ChartFilterProvider>
    );
    // only one point survives the "last week" filter, so it falls back to the empty note
    expect(screen.getByText("No entries logged in this time range.")).toBeInTheDocument();
  });
});
