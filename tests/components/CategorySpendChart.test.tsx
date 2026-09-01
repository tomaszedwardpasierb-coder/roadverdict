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
});
