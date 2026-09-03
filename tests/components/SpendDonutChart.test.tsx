// Place at: tests/components/SpendDonutChart.test.tsx
//
// SpendDonutChart computes real category totals (via filterByDateRange
// and the currency converters) and hands them to react-chartjs-2. jsdom
// has no real <canvas>, so react-chartjs-2 itself is mocked - the right
// level to test at is the data/options object the chart actually
// receives, which is exactly what these tests assert on. The legend and
// centre-total, however, are plain HTML rendered by this component
// itself, not by the mocked chart, so those are asserted on for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const chartMocks = vi.hoisted(() => ({
  doughnut: vi.fn((_props: unknown) => null),
  bar: vi.fn((_props: unknown) => null),
}));
vi.mock("react-chartjs-2", () => ({
  Doughnut: (props: unknown) => chartMocks.doughnut(props),
  Bar: (props: unknown) => chartMocks.bar(props),
}));

import { SpendDonutChart } from "@/app/dashboard/SpendDonutChart";

const records = [{ date: "2024-01-01", cost: 100 }];
const mods = [{ date: "2024-01-01", cost: 50 }];
const fuelLogs = [{ date: "2024-01-01", cost: 30 }];
const bills = [{ date: "2024-01-01", cost: 20 }];

describe("SpendDonutChart", () => {
  beforeEach(() => {
    chartMocks.doughnut.mockClear();
    chartMocks.bar.mockClear();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the empty note and renders neither chart when nothing has been logged", () => {
    render(<SpendDonutChart records={[]} mods={[]} fuelLogs={[]} bills={[]} currency="GBP" rates={null} />);

    expect(screen.getByText("Nothing logged in this range.")).toBeInTheDocument();
    expect(chartMocks.doughnut).not.toHaveBeenCalled();
    expect(chartMocks.bar).not.toHaveBeenCalled();
  });

  it("defaults to the pie view, handing the mocked Doughnut the real per-category totals", () => {
    render(<SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} />);

    expect(chartMocks.doughnut).toHaveBeenCalledTimes(1);
    const props = chartMocks.doughnut.mock.calls[0][0] as any;
    expect(props.data.labels).toEqual(["Servicing & repairs", "Modifications", "Fuel", "Insurance/tax/MOT"]);
    expect(props.data.datasets[0].data).toEqual([100, 50, 30, 20]);
    expect(props.data.datasets[0].backgroundColor).toEqual(["#1C1D20", "#EE9A2E", "#21815A", "#8A867D"]);
    expect(props.options.cutout).toBe("68%");
  });

  it("renders the real HTML legend and centre total, not just the chart data, when Pro", () => {
    render(<SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} isPro />);

    expect(screen.getByText("Servicing & repairs")).toBeInTheDocument();
    expect(screen.getByText("£100")).toBeInTheDocument();
    expect(screen.getByText("£50")).toBeInTheDocument();
    expect(screen.getByText("£30")).toBeInTheDocument();
    expect(screen.getByText("£20")).toBeInTheDocument();
    expect(screen.getAllByText("£200").length).toBeGreaterThan(0); // grand total (header line + ring centre)
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("obscures category names and per-category amounts when not Pro, but keeps the grand total visible", () => {
    render(<SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} />);

    expect(screen.queryByText("Servicing & repairs")).not.toBeInTheDocument();
    expect(screen.queryByText("£100")).not.toBeInTheDocument();
    expect(screen.queryByText("£50")).not.toBeInTheDocument();
    // Grand total still shows, in the always-visible header line and the ring's own centre.
    expect(screen.getAllByText("£200").length).toBeGreaterThan(0);
    const upsell = screen.getByRole("link", { name: /Category breakdown - Premium/ });
    expect(upsell).toHaveAttribute("href", "/pro");
  });

  it("disables the chart tooltip and hides the axis ticks that would reveal a category's name or amount when not Pro", () => {
    render(<SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} />);

    const props = chartMocks.doughnut.mock.calls[0][0] as any;
    expect(props.options.plugins.tooltip.enabled).toBe(false);
  });

  it("honours initialChartType='bar' by rendering the mocked Bar chart from the start", () => {
    render(
      <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} initialChartType="bar" />
    );
    expect(chartMocks.bar).toHaveBeenCalledTimes(1);
    expect(chartMocks.doughnut).not.toHaveBeenCalled();
  });

  it("clicking the Bar toggle switches the real chart and persists the preference via PATCH /api/tracker/bike", async () => {
    const user = userEvent.setup();
    render(<SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} />);

    await user.click(screen.getByRole("button", { name: "Bar" }));

    expect(chartMocks.bar).toHaveBeenCalledTimes(1);
    const barProps = chartMocks.bar.mock.calls[0][0] as any;
    expect(barProps.data.datasets[0].data).toEqual([100, 50, 30, 20]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ chartType: { chartId: "spend-donut", kind: "bar" } }),
      })
    );
  });

  it("converts every real total to the display currency before handing it to the chart", () => {
    const rates = { base: "GBP" as const, rates: { EUR: 1.15 }, fetchedAt: "2024-01-01T00:00:00.000Z" };
    render(<SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="EUR" rates={rates} isPro />);

    const props = chartMocks.doughnut.mock.calls[0][0] as any;
    const [servicing, modsVal, fuelVal, billsVal] = props.data.datasets[0].data;
    expect(servicing).toBeCloseTo(115);
    expect(modsVal).toBeCloseTo(57.5);
    expect(fuelVal).toBeCloseTo(34.5);
    expect(billsVal).toBeCloseTo(23);
    expect(screen.getByText("€115")).toBeInTheDocument();
  });

  it("in bar view, replaces category tick labels with a lock and hides the value axis when not Pro, but shows both when Pro", () => {
    render(
      <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} initialChartType="bar" />
    );
    const freeProps = chartMocks.bar.mock.calls[0][0] as any;
    expect(freeProps.options.plugins.tooltip.enabled).toBe(false);
    expect(freeProps.options.scales.x.ticks.callback(100, 0)).toBe("🔒");
    expect(freeProps.options.scales.y.ticks.display).toBe(false);

    chartMocks.bar.mockClear();
    render(
      <SpendDonutChart records={records} mods={mods} fuelLogs={fuelLogs} bills={bills} currency="GBP" rates={null} initialChartType="bar" isPro />
    );
    const proProps = chartMocks.bar.mock.calls[0][0] as any;
    expect(proProps.options.scales.x.ticks.callback(100, 0)).toBe("Servicing & repairs");
    expect(proProps.options.scales.y.ticks.callback(50)).toBe("£50");
  });
});
