// Place at: tests/components/VdiMileageChart.test.tsx
//
// Same react-chartjs-2 mocking approach as MileageChart.test.tsx (no real
// canvas in jsdom) - the scriptable backgroundColor/pointBackgroundColor
// functions are exercised directly by invoking them with a fake context,
// same as chartStyle.test.ts's own approach to testing scriptable colours.
import { beforeEach, describe, expect, it, vi } from "vitest";
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

import { VdiMileageChart } from "@/components/VdiMileageChart";

const cleanReadings = [
  { date: "2021-06-01T00:00:00Z", mileage: 11000, inSequence: true, dataSource: "MOT" },
  { date: "2022-06-01T00:00:00Z", mileage: 14000, inSequence: true, dataSource: "MOT" },
  { date: "2023-06-01T00:00:00Z", mileage: 17000, inSequence: true, dataSource: "MOT" },
];

describe("VdiMileageChart", () => {
  beforeEach(() => {
    chartProps.Line = null;
    chartProps.Bar = null;
  });

  it("renders nothing at all with fewer than 2 readings, rather than a one-point chart", () => {
    const { container } = render(<VdiMileageChart readings={[cleanReadings[0]]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing with zero readings", () => {
    const { container } = render(<VdiMileageChart readings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("defaults to a bar chart with the readings sorted oldest-first", () => {
    // Passed in out of order, on purpose - the component must sort them
    // itself rather than trust the caller's ordering.
    render(<VdiMileageChart readings={[cleanReadings[2], cleanReadings[0], cleanReadings[1]]} />);
    expect(chartProps.Bar).not.toBeNull();
    expect(chartProps.Line).toBeNull();
    expect(chartProps.Bar.data.datasets[0].data).toEqual([11000, 14000, 17000]);
  });

  it("switches to a line chart when the toggle is clicked", async () => {
    const user = userEvent.setup();
    render(<VdiMileageChart readings={cleanReadings} />);
    await user.click(screen.getByRole("button", { name: "line" }));
    expect(chartProps.Line).not.toBeNull();
    expect(chartProps.Line.data.datasets[0].data).toEqual([11000, 14000, 17000]);
  });

  it("shows no anomaly warning when every reading is in sequence", () => {
    render(<VdiMileageChart readings={cleanReadings} />);
    expect(screen.queryByText(/lower than an earlier one/)).not.toBeInTheDocument();
  });

  it("shows an anomaly warning, and colours the offending bar/point red, when a reading is out of sequence", async () => {
    const withAnomaly = [
      { date: "2022-06-01T00:00:00Z", mileage: 14000, inSequence: true, dataSource: "MOT" },
      { date: "2023-06-01T00:00:00Z", mileage: 9000, inSequence: false, dataSource: "MOT" },
    ];
    render(<VdiMileageChart readings={withAnomaly} />);
    expect(screen.getByText(/lower than an earlier one/)).toBeInTheDocument();

    // The out-of-sequence point (index 1) gets the anomaly-red colour,
    // the in-sequence one (index 0) gets the normal amber gradient.
    const bg = chartProps.Bar.data.datasets[0].backgroundColor;
    expect(bg({ dataIndex: 1 })).toBe("#C1483A");
    expect(bg({ dataIndex: 0, chart: { ctx: null, chartArea: null } })).not.toBe("#C1483A");

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "line" }));
    const pointColor = chartProps.Line.data.datasets[0].pointBackgroundColor;
    expect(pointColor({ dataIndex: 1 })).toBe("#C1483A");
    expect(pointColor({ dataIndex: 0 })).toBe("#EE9A2E");
  });

  it("surfaces a footer tooltip note only for the out-of-sequence reading", () => {
    const withAnomaly = [
      { date: "2022-06-01T00:00:00Z", mileage: 14000, inSequence: true, dataSource: "MOT" },
      { date: "2023-06-01T00:00:00Z", mileage: 9000, inSequence: false, dataSource: "MOT" },
    ];
    render(<VdiMileageChart readings={withAnomaly} />);
    const footer = chartProps.Bar.options.plugins.tooltip.callbacks.footer;
    expect(footer([{ dataIndex: 0 }])).toBeUndefined();
    expect(footer([{ dataIndex: 1 }])).toMatch(/Lower than a previous reading/);
  });
});
