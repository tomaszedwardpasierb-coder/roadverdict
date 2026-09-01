// Place at: tests/components/MpgChart.test.tsx
//
// MpgChart computes real chart data/options (unit conversion, exclusion
// styling, click-to-view-records) and hands them to react-chartjs-2's
// Line/Bar - jsdom has no real canvas, so Chart.js itself would throw or
// no-op here. react-chartjs-2 is mocked to a prop-capturing stand-in;
// everything else (the maths, the copy, TabSwitchContext) runs for real.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const chartMocks = vi.hoisted(() => ({
  line: vi.fn((_props: unknown) => null),
  bar: vi.fn((_props: unknown) => null),
}));
vi.mock("react-chartjs-2", () => ({
  Line: (props: unknown) => chartMocks.line(props),
  Bar: (props: unknown) => chartMocks.bar(props),
}));

import { MpgChart } from "@/app/dashboard/MpgChart";
import { TabSwitchProvider } from "@/app/dashboard/TabSwitchContext";
import type { MpgSegment } from "@/lib/tracker/mpgCalc";

function seg(overrides: Partial<MpgSegment> = {}): MpgSegment {
  return {
    mileage: 1000,
    mpg: 60,
    date: "2024-01-01",
    fuelLogId: "log-1",
    likelyMissedFillUps: false,
    ...overrides,
  };
}

function lastLineProps() {
  const calls = chartMocks.line.mock.calls;
  return calls[calls.length - 1][0] as any;
}
function lastBarProps() {
  const calls = chartMocks.bar.mock.calls;
  return calls[calls.length - 1][0] as any;
}

const noRates = null;

describe("MpgChart", () => {
  afterEach(() => {
    chartMocks.line.mockClear();
    chartMocks.bar.mockClear();
  });

  it("shows an empty-state note and never mounts a chart when there are no fill-ups", () => {
    render(
      <MpgChart series={[]} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    expect(screen.getByText("No fill-ups logged in this time range.")).toBeInTheDocument();
    expect(chartMocks.line).not.toHaveBeenCalled();
    expect(chartMocks.bar).not.toHaveBeenCalled();
  });

  it("defaults to a line chart, titled with the average of only the trusted (non-excluded) readings", () => {
    const series = [
      seg({ mpg: 60, likelyMissedFillUps: false }),
      seg({ mpg: 80, likelyMissedFillUps: false }),
      seg({ mpg: 10, likelyMissedFillUps: true, exclusionReason: "unusual-gap" }),
    ];
    render(
      <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    // Average of 60 and 80 only, the excluded 10 must not drag it down.
    expect(screen.getByText("MPG over time - 70.0 mpg average")).toBeInTheDocument();
    expect(chartMocks.line).toHaveBeenCalledTimes(1);
    expect(chartMocks.bar).not.toHaveBeenCalled();
  });

  it("switching the toggle to Bar renders the Bar chart instead, with the same underlying values", async () => {
    const series = [seg({ mpg: 55 })];
    const user = userEvent.setup();
    render(
      <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    await user.click(screen.getByRole("button", { name: "Bar" }));

    expect(chartMocks.bar).toHaveBeenCalled();
    const props = lastBarProps();
    expect(props.data.datasets[0].data).toEqual([55]);
  });

  it("converts values to L/100km when that's the selected fuel economy unit", () => {
    const series = [seg({ mpg: 40 })];
    render(
      <MpgChart series={series} fuelEconomyUnit="l100km" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    const props = lastLineProps();
    // (4.546 * 100) / (40 * 1.60934) = 7.06...
    expect(props.data.datasets[0].data[0]).toBeCloseTo(7.1, 1);
    expect(screen.getByText(/L\/100km average/)).toBeInTheDocument();
  });

  it("excludes flagged points from the main series values but plots them on the separate 'Excluded' dataset", () => {
    const series = [
      seg({ mpg: 60, likelyMissedFillUps: false }),
      seg({ mpg: 12, likelyMissedFillUps: true, exclusionReason: "unusual-gap" }),
    ];
    render(
      <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    const props = lastLineProps();
    const [mainDataset, excludedDataset] = props.data.datasets;
    expect(mainDataset.data).toEqual([60, 12]); // still plotted in position, not removed
    expect(excludedDataset.label).toBe("Excluded");
    expect(excludedDataset.data).toEqual([null, 12]);
  });

  it("reports the count of unusual-gap/anomalous exclusions separately from marked anomalies", () => {
    const series = [
      seg({ likelyMissedFillUps: true, exclusionReason: "unusual-gap" }),
      seg({ likelyMissedFillUps: true, exclusionReason: "marked-anomaly" }),
      seg({ likelyMissedFillUps: true, exclusionReason: "marked-anomaly" }),
    ];
    render(
      <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    expect(screen.getByText(/1 reading looks far enough outside your usual range/)).toBeInTheDocument();
    expect(screen.getByText(/2 readings are marked as a known anomaly/)).toBeInTheDocument();
  });

  it("shows the excluded fuel spend note, formatted in the selected currency, only when there is any", () => {
    render(
      <MpgChart
        series={[seg()]}
        fuelEconomyUnit="mpg"
        distanceUnit="mi"
        currency="GBP"
        rates={noRates}
        excludedFuelEntries={[{ date: "2024-01-01", cost: 42 }]}
      />
    );
    expect(screen.getByText(/£42 of fuel spend excluded from this calculation/)).toBeInTheDocument();
  });

  it("sorts points chronologically for the time-based view regardless of the input array's order", () => {
    const series = [
      seg({ date: "2024-03-01", mpg: 30, fuelLogId: "march" }),
      seg({ date: "2024-01-01", mpg: 10, fuelLogId: "jan" }),
      seg({ date: "2024-02-01", mpg: 20, fuelLogId: "feb" }),
    ];
    render(
      <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    const props = lastLineProps();
    expect(props.data.datasets[0].data).toEqual([10, 20, 30]);
  });

  it("clicking a plotted point with a fuelLogId switches to the fuel tab and highlights that record", () => {
    const onSwitchTab = vi.fn();
    const series = [seg({ fuelLogId: "log-42" })];
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <MpgChart series={series} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
      </TabSwitchProvider>
    );
    const props = lastLineProps();
    props.options.onClick(null, [{ index: 0 }]);
    expect(onSwitchTab).toHaveBeenCalledWith("fuel");
  });

  it("clicking with no elements under the pointer does nothing", () => {
    const onSwitchTab = vi.fn();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <MpgChart series={[seg()]} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
      </TabSwitchProvider>
    );
    const props = lastLineProps();
    props.options.onClick(null, []);
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it("hovering a point sets a pointer cursor; hovering empty space resets it", () => {
    render(
      <MpgChart series={[seg()]} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    const props = lastLineProps();
    const target = document.createElement("div");

    props.options.onHover({ native: { target } }, [{}]);
    expect(target.style.cursor).toBe("pointer");

    props.options.onHover({ native: { target } }, []);
    expect(target.style.cursor).toBe("default");
  });

  it("the chart type toggle is hidden entirely when only one option is offered", () => {
    // MpgChart always passes ['line', 'bar'] today, so the toggle should
    // be visible - this pins that assumption rather than assuming it.
    render(
      <MpgChart series={[seg()]} fuelEconomyUnit="mpg" distanceUnit="mi" currency="GBP" rates={noRates} excludedFuelEntries={[]} />
    );
    expect(screen.getByRole("button", { name: "Line" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bar" })).toBeInTheDocument();
  });
});
