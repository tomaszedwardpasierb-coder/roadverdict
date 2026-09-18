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
import type { ForecastWindow, ForecastMonthPoint } from "@/lib/tracker/costForecast";

function SetRange({ value }: { value: "all" | "1w" }) {
  const { setRange } = useChartFilter();
  useEffect(() => {
    setRange(value);
  }, [value, setRange]);
  return null;
}

function ForecastControls() {
  const { setForecastMode, setForecastWindow } = useChartFilter();
  return (
    <div>
      <button type="button" onClick={() => setForecastMode(true)}>enable forecast</button>
      <button type="button" onClick={() => setForecastWindow("1y")}>window 1y</button>
    </div>
  );
}

// Deliberately short, distinguishable point counts per window (not the
// real engine's actual counts) so a test can tell which window's own
// forecast got picked, and that every point (not just one) got appended
// - this component only ever renders whatever bundle it's handed (see
// its own comment on `forecast`).
const sampleForecast: Record<ForecastWindow, ForecastMonthPoint[]> = {
  "1w": [{ month: "Next week", total: 1050 }],
  "1m": [{ month: "Next month", total: 1200 }],
  "6m": [{ month: "Jul 26", total: 1300 }, { month: "Aug 26", total: 1600 }],
  "1y": [{ month: "Jul 26", total: 1300 }, { month: "Dec 26", total: 1800 }, { month: "Jun 27", total: 2000 }],
};

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

  // Was hardcoded to PATCH /api/tracker/bike unconditionally - on a
  // hybrid account (owns both a bike and a car) with the car active,
  // this used to silently overwrite the BIKE's own chart-type
  // preference instead of the car's.
  it("PATCHes /api/cars/car instead of /api/tracker/bike when vehicleKind is 'car'", async () => {
    const user = userEvent.setup();
    render(<MileageChart points={points} distanceUnit="mi" vehicleKind="car" />);
    await user.click(screen.getByRole("button", { name: "Bar" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car", expect.objectContaining({ method: "PATCH" }));
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

  describe("forecast mode", () => {
    it("appends every point of the active window's projected trend, shows the Estimate badge, and ignores the real date range", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <SetRange value="1w" />
          <ForecastControls />
          <MileageChart points={points} distanceUnit="mi" forecast={sampleForecast} />
        </ChartFilterProvider>
      );
      // "1w" range alone would normally drop both real points to the
      // empty note - forecast mode shows them anyway (range doesn't apply).
      expect(screen.queryByText("Estimate")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.getByText("Estimate")).toBeInTheDocument();
      // 2 real points + both of the 6m (default) window's projected points.
      expect(chartProps.Line.data.labels).toHaveLength(4);
      expect(chartProps.Line.data.labels.slice(2)).toEqual(["Jul 26", "Aug 26"]);
      expect(chartProps.Line.data.datasets[0].data).toEqual([1000, 1200, 1300, 1600]);
    });

    it("switching the forecast window swaps in that window's own projected trend", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <MileageChart points={points} distanceUnit="mi" forecast={sampleForecast} />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      await user.click(screen.getByRole("button", { name: "window 1y" }));

      expect(chartProps.Line.data.datasets[0].data).toEqual([1000, 1200, 1300, 1800, 2000]);
      expect(chartProps.Line.data.labels.slice(2)).toEqual(["Jul 26", "Dec 26", "Jun 27"]);
    });

    it("clicking a forecast point is a no-op, since it isn't a real logged reading", async () => {
      const user = userEvent.setup();
      const onSwitchTab = vi.fn();
      render(
        <TabSwitchProvider onSwitchTab={onSwitchTab}>
          <ChartFilterProvider>
            <ForecastControls />
            <MileageChart points={points} distanceUnit="mi" forecast={sampleForecast} />
          </ChartFilterProvider>
        </TabSwitchProvider>
      );
      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      act(() => {
        chartProps.Line.options.onClick(null, [{ index: 2 }]); // the appended forecast point
      });
      expect(onSwitchTab).not.toHaveBeenCalled();
    });

    it("behaves like the normal view when forecast mode is on but no forecast prop was ever passed", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <MileageChart points={points} distanceUnit="mi" />
        </ChartFilterProvider>
      );
      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
      expect(chartProps.Line.data.labels).toHaveLength(2);
    });
  });
});
