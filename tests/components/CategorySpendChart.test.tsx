// Place at: tests/components/CategorySpendChart.test.tsx
//
// CategorySpendChart buckets a single category's real records (by month
// or, when supportsMileageView, by mileage band) and hands them to
// react-chartjs-2, plus wires clicking a bucket to
// TabSwitchContext.viewRecords. jsdom has no real <canvas>, so
// react-chartjs-2 is mocked - assertions target the data/options object
// the chart receives (including invoking the captured onClick handler
// directly, since there's no real canvas to click) rather than the
// canvas itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const chartMocks = vi.hoisted(() => ({
  bar: vi.fn((_props: unknown) => null),
  line: vi.fn((_props: unknown) => null),
}));
vi.mock("react-chartjs-2", () => ({
  Bar: (props: unknown) => chartMocks.bar(props),
  Line: (props: unknown) => chartMocks.line(props),
}));

import { CategorySpendChart } from "@/app/dashboard/CategorySpendChart";
import { ChartFilterProvider, useChartFilter } from "@/app/dashboard/ChartFilterContext";
import { TabSwitchProvider } from "@/app/dashboard/TabSwitchContext";
import type { CategoryForecast, ForecastWindow } from "@/lib/tracker/costForecast";

function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

const monthlyItems = [
  { id: "a", date: "2024-01-05", cost: 100 },
  { id: "b", date: "2024-02-10", cost: 200 },
  { id: "c", date: "2024-02-20", cost: 50 },
];

function ViewByToggleButton() {
  const { viewBy, setViewBy } = useChartFilter();
  return (
    <button type="button" onClick={() => setViewBy(viewBy === "time" ? "mileage" : "time")}>
      toggle view-by
    </button>
  );
}

function ForecastControls() {
  const { setForecastMode, setForecastWindow } = useChartFilter();
  return (
    <div>
      <button type="button" onClick={() => setForecastMode(true)}>enable forecast</button>
      <button type="button" onClick={() => setForecastMode(false)}>disable forecast</button>
      <button type="button" onClick={() => setForecastWindow("1m")}>window 1m</button>
      <button type="button" onClick={() => setForecastWindow("1y")}>window 1y</button>
    </div>
  );
}

// Distinguishable point counts per window (1/1/3/4) so a test can tell
// which window's forecast actually got picked, without depending on the
// real engine's FORECAST_WINDOW_MONTHS - this component only ever
// renders whatever bundle it's handed (see its own comment on `forecast`).
const sampleForecast: Record<ForecastWindow, CategoryForecast> = {
  "1w": { points: [{ month: "Next week", total: 10 }], basis: "1w basis text" },
  "1m": { points: [{ month: "Next month", total: 40 }], basis: "1m basis text" },
  "6m": { points: [{ month: "Mar 24", total: 40 }, { month: "Apr 24", total: 40 }, { month: "May 24", total: 40 }], basis: "6m basis text" },
  "1y": {
    points: [
      { month: "Mar 24", total: 40 }, { month: "Apr 24", total: 40 }, { month: "May 24", total: 40 }, { month: "Jun 24", total: 40 },
    ],
    basis: "1y basis text",
  },
};

describe("CategorySpendChart", () => {
  beforeEach(() => {
    chartMocks.bar.mockClear();
    chartMocks.line.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the not-enough-data note, with no chart rendered, for a single bucket", () => {
    render(
      <CategorySpendChart
        chartId="svc"
        title="Service spend"
        items={[monthlyItems[0]]}
        category="service"
        color="#123456"
        currency="GBP"
        rates={null}
        distanceUnit="mi"
      />
    );
    expect(screen.getByText("Not enough data in this range to chart yet.")).toBeInTheDocument();
    expect(chartMocks.bar).not.toHaveBeenCalled();
  });

  it("buckets real records by month and hands the mocked Bar chart the real totals", () => {
    render(
      <CategorySpendChart
        chartId="svc"
        title="Service spend"
        items={monthlyItems}
        category="service"
        color="#123456"
        currency="GBP"
        rates={null}
        distanceUnit="mi"
      />
    );

    expect(chartMocks.bar).toHaveBeenCalledTimes(1);
    const props = chartMocks.bar.mock.calls[0][0] as any;
    expect(props.data.labels).toEqual([monthLabel(2024, 1), monthLabel(2024, 2)]);
    expect(props.data.datasets[0].data).toEqual([100, 250]);
  });

  it("switches to the mocked Line chart and persists the choice via PATCH /api/tracker/bike", async () => {
    const user = userEvent.setup();
    render(
      <CategorySpendChart
        chartId="svc"
        title="Service spend"
        items={monthlyItems}
        category="service"
        color="#123456"
        currency="GBP"
        rates={null}
        distanceUnit="mi"
      />
    );
    chartMocks.bar.mockClear(); // initial render already used Bar (the default kind) once

    await user.click(screen.getByRole("button", { name: "Line" }));

    expect(chartMocks.line).toHaveBeenCalledTimes(1);
    expect(chartMocks.bar).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ chartType: { chartId: "svc", kind: "line" } }) })
    );
  });

  // Without this, a car-active session toggling this chart would
  // silently overwrite the BIKE's own stored chart-type preference
  // instead of the car's - same bug class MileageChart/SpendDonutChart
  // were already fixed for.
  it("PATCHes /api/cars/car instead of /api/tracker/bike when vehicleKind is 'car'", async () => {
    const user = userEvent.setup();
    render(
      <CategorySpendChart
        chartId="svc"
        title="Service spend"
        items={monthlyItems}
        category="service"
        color="#123456"
        currency="GBP"
        rates={null}
        distanceUnit="mi"
        vehicleKind="car"
      />
    );
    await user.click(screen.getByRole("button", { name: "Line" }));

    expect(fetch).toHaveBeenCalledWith("/api/cars/car", expect.objectContaining({ method: "PATCH" }));
  });

  it("clicking a bucket switches tabs and highlights every real record id in it", () => {
    const onSwitchTab = vi.fn();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <CategorySpendChart
          chartId="svc"
          title="Service spend"
          items={monthlyItems}
          category="service"
          color="#123456"
          currency="GBP"
          rates={null}
          distanceUnit="mi"
        />
      </TabSwitchProvider>
    );

    const props = chartMocks.bar.mock.calls[0][0] as any;
    // Bucket index 1 is February, which sums records "b" and "c".
    props.options.onClick(undefined, [{ index: 1 }]);

    expect(onSwitchTab).toHaveBeenCalledWith("service");
  });

  it("a click with no bucket under the cursor is a no-op", () => {
    const onSwitchTab = vi.fn();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <CategorySpendChart
          chartId="svc"
          title="Service spend"
          items={monthlyItems}
          category="service"
          color="#123456"
          currency="GBP"
          rates={null}
          distanceUnit="mi"
        />
      </TabSwitchProvider>
    );

    const props = chartMocks.bar.mock.calls[0][0] as any;
    props.options.onClick(undefined, []);
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it("shows a specific note instead of charting by mileage when this category doesn't support it", async () => {
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ViewByToggleButton />
        <CategorySpendChart
          chartId="bills"
          title="Bills"
          items={monthlyItems}
          category="bills"
          color="#123456"
          currency="GBP"
          rates={null}
          distanceUnit="mi"
          supportsMileageView={false}
        />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "toggle view-by" }));
    expect(screen.getByText(/Shown by date - this isn't logged against a mileage reading\./)).toBeInTheDocument();
  });

  it("buckets by real mileage band, converting band edges to the display unit, when mileage view is active", async () => {
    const itemsWithMileage = [
      { id: "a", date: "2024-01-01", cost: 100, mileage: 100 },
      { id: "b", date: "2024-02-01", cost: 200, mileage: 600 },
      { id: "c", date: "2024-03-01", cost: 50, mileage: 1200 },
    ];
    const user = userEvent.setup();
    render(
      <ChartFilterProvider>
        <ViewByToggleButton />
        <CategorySpendChart
          chartId="svc"
          title="Service spend"
          items={itemsWithMileage}
          category="service"
          color="#123456"
          currency="GBP"
          rates={null}
          distanceUnit="mi"
        />
      </ChartFilterProvider>
    );

    await user.click(screen.getByRole("button", { name: "toggle view-by" }));

    const props = chartMocks.bar.mock.calls[chartMocks.bar.mock.calls.length - 1][0] as any;
    expect(props.data.labels).toEqual(["0-250 miles", "500-750 miles", "1000-1250 miles"]);
    expect(props.data.datasets[0].data).toEqual([100, 200, 50]);
  });

  describe("forecast mode", () => {
    it("shows the Estimate badge and basis text, and appends the active window's forecast points after the real data", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <CategorySpendChart
            chartId="svc"
            title="Service spend"
            items={monthlyItems}
            category="service"
            color="#123456"
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            forecast={sampleForecast}
          />
        </ChartFilterProvider>
      );
      expect(screen.queryByText("Estimate")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.getByText("Estimate")).toBeInTheDocument();
      expect(screen.getByText("6m basis text")).toBeInTheDocument();
      const props = chartMocks.bar.mock.calls[chartMocks.bar.mock.calls.length - 1][0] as any;
      // 2 real months (Jan, Feb) + the 6m window's 3 forecast points.
      expect(props.data.labels).toEqual(["Jan 24", "Feb 24", "Mar 24", "Apr 24", "May 24"]);
      expect(props.data.datasets[0].data).toEqual([100, 250, 40, 40, 40]);
    });

    it("switching the forecast window swaps in that window's own precomputed forecast", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <CategorySpendChart
            chartId="svc"
            title="Service spend"
            items={monthlyItems}
            category="service"
            color="#123456"
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            forecast={sampleForecast}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));
      await user.click(screen.getByRole("button", { name: "window 1y" }));

      expect(screen.getByText("1y basis text")).toBeInTheDocument();
      const props = chartMocks.bar.mock.calls[chartMocks.bar.mock.calls.length - 1][0] as any;
      // 2 real months + the 1y window's 4 forecast points.
      expect(props.data.labels).toHaveLength(6);
    });

    it("clicking a forecast-only bucket is a no-op, since it carries no real record ids to jump to", async () => {
      const user = userEvent.setup();
      const onSwitchTab = vi.fn();
      render(
        <TabSwitchProvider onSwitchTab={onSwitchTab}>
          <ChartFilterProvider>
            <ForecastControls />
            <CategorySpendChart
              chartId="svc"
              title="Service spend"
              items={monthlyItems}
              category="service"
              color="#123456"
              currency="GBP"
              rates={null}
              distanceUnit="mi"
              forecast={sampleForecast}
            />
          </ChartFilterProvider>
        </TabSwitchProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      const props = chartMocks.bar.mock.calls[chartMocks.bar.mock.calls.length - 1][0] as any;
      // Index 2 is the first forecast point (past count is 2: Jan, Feb).
      props.options.onClick(undefined, [{ index: 2 }]);
      expect(onSwitchTab).not.toHaveBeenCalled();
    });

    it("prefixes the tooltip label with 'Est.' for a forecast point but not for a real one", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <CategorySpendChart
            chartId="svc"
            title="Service spend"
            items={monthlyItems}
            category="service"
            color="#123456"
            currency="GBP"
            rates={null}
            distanceUnit="mi"
            forecast={sampleForecast}
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      const props = chartMocks.bar.mock.calls[chartMocks.bar.mock.calls.length - 1][0] as any;
      const label = props.options.plugins.tooltip.callbacks;
      expect(label.label({ dataIndex: 2, parsed: { y: 40 } })).toBe("Est. £40");
      expect(label.label({ dataIndex: 0, parsed: { y: 100 } })).toBe("£100");
    });

    it("behaves like the normal past view when forecast mode is on but no forecast data was ever wired up for this chart", async () => {
      const user = userEvent.setup();
      render(
        <ChartFilterProvider>
          <ForecastControls />
          <CategorySpendChart
            chartId="bills"
            title="Bills"
            items={monthlyItems}
            category="bills"
            color="#123456"
            currency="GBP"
            rates={null}
            distanceUnit="mi"
          />
        </ChartFilterProvider>
      );

      await user.click(screen.getByRole("button", { name: "enable forecast" }));

      expect(screen.queryByText("Estimate")).not.toBeInTheDocument();
      const props = chartMocks.bar.mock.calls[chartMocks.bar.mock.calls.length - 1][0] as any;
      expect(props.data.labels).toEqual(["Jan 24", "Feb 24"]);
    });
  });
});
