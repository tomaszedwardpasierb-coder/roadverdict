// Place at: tests/components/VdiCheckReport.test.tsx
//
// Tests the shared VDI display directly, rather than only through
// CarBuyingGuideForm/BuyingGuideForm - this is the one place the "not
// available for this vehicle" fallback pattern and the lucide-react icon
// swap actually live, so it deserves its own focused coverage rather
// than relying entirely on the two forms' own (much larger) test files.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { VdiCheckResult } from "@/lib/tracker/vdiUnlock";

// Same react-chartjs-2 stand-in convention as CarBuyingGuideForm.test.tsx
// - real canvas rendering is exercised by VdiMileageChart.test.tsx itself.
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mileage-chart-line" />,
  Bar: () => <div data-testid="mileage-chart-bar" />,
}));

import { VdiCheckReport } from "@/components/VdiCheckReport";

// The minimum a real VdiCheckResult always carries - every optional
// field is left undefined here, exercising the "not available" fallback
// path for every group unless a specific test adds fields back in.
const minimalVdi: VdiCheckResult = {
  isStolen: false,
  hasWriteOffRecord: false,
  writeOffRecordCount: 0,
  hasOutstandingFinance: false,
  financeRecords: [],
  keeperChanges: [],
  keeperChangeCount: 0,
  plateChangeCount: 0,
  colourChangeCount: 0,
  currentColour: null,
  vedFirstYearTwelveMonths: null,
  vedStandardTwelveMonths: null,
  v5cReissueCount: 0,
  calculatedAverageAnnualMileage: null,
  averageMileageForAge: null,
  mileageAnomalyDetected: false,
  manufacturerWarrantyMiles: null,
  manufacturerWarrantyMonths: null,
};

describe("VdiCheckReport", () => {
  it("shows a plain 'not available' fallback, not an empty list, for every group with no populated fields", () => {
    render(<VdiCheckReport vdiCheck={minimalVdi} vehicleNoun="bike" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);

    for (const heading of ["Euro NCAP safety rating", "Identity", "Dimensions", "Status flags", "Running costs", "Technical spec", "Performance", "EV performance & range", "Fuel economy", "Police National Computer record", "Mileage integrity", "Manufacturer warranty"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Not available for this bike.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not available for this bike - only applies to an electric/).length).toBeGreaterThan(0);
  });

  it("always shows Safety & history, Colour, and Ownership history with real values, never a fallback", () => {
    render(<VdiCheckReport vdiCheck={minimalVdi} vehicleNoun="car" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText("No stolen marker found")).toBeInTheDocument();
    expect(screen.getByText("No write-off record found")).toBeInTheDocument();
    expect(screen.getByText("No outstanding finance found")).toBeInTheDocument();
    expect(screen.getByText("Colour not recorded (0 change(s) on record)")).toBeInTheDocument();
    expect(screen.getByText("0 keeper change(s) on record")).toBeInTheDocument();
    expect(screen.getByText("0 plate change(s) on record")).toBeInTheDocument();
    expect(screen.getByText("0 V5C logbook reissue(s) on record")).toBeInTheDocument();
  });

  it("renders the purchase banner using pricePaidPence/purchasedAt/expiresAt", () => {
    render(<VdiCheckReport vdiCheck={minimalVdi} vehicleNoun="car" pricePaidPence={1499} purchasedAt="2026-01-01T00:00:00.000Z" expiresAt="2026-01-15T00:00:00.000Z" />);
    expect(screen.getByText(/included with your £14\.99 purchase/)).toBeInTheDocument();
    expect(screen.getByText(/Bought 01\/01\/2026 - free to look up again until 15\/01\/2026/)).toBeInTheDocument();
  });

  it("says 'your free Premium report' when no price was paid", () => {
    render(<VdiCheckReport vdiCheck={minimalVdi} vehicleNoun="car" pricePaidPence={0} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText(/your free Premium report/)).toBeInTheDocument();
  });

  it("renders icons as real SVG elements, not emoji text", () => {
    const { container } = render(<VdiCheckReport vdiCheck={minimalVdi} vehicleNoun="car" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(5);
    // The old per-row decorative emoji this component used to render -
    // ✓/⚠️ are deliberately excluded, since those are meaningful status
    // glyphs kept on purpose, not the "toy-like" per-row icons replaced
    // by lucide-react.
    expect(container.textContent).not.toMatch(/[🛡️💥💳🎨👤🔢🛣️🚓🚗📅🚙🌍📦♻️🏛️🌫️⚖️🔧⚙️⛽🏁💪🚀🔊📊🧾⚡🔌🔋🧲🗺️⭐]/u);
  });

  it("renders the new fields confirmed against the Royal Enfield motorcycle sample", () => {
    const vdi: VdiCheckResult = {
      ...minimalVdi,
      engineCapacityCc: 648,
      dvlaEngineCapacityCc: 650,
      numberOfSeats: 2,
      powerToWeightRatio: 0.17,
      modelStartDate: "2019-01-04T00:00:00Z",
      modelEndDate: "2022-10-10T00:00:00Z",
      typeApprovalCategory: "L3",
      vedFirstYearTwelveMonths: 405,
    };
    render(<VdiCheckReport vdiCheck={vdi} vehicleNoun="bike" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText("Engine capacity: 648cc")).toBeInTheDocument();
    expect(screen.getByText("DVLA-registered engine capacity: 650cc")).toBeInTheDocument();
    expect(screen.getByText("Seats: 2")).toBeInTheDocument();
    expect(screen.getByText(/Power-to-weight ratio: 0\.17 kW\/kg/)).toBeInTheDocument();
    expect(screen.getByText(/Type-approval category: L3/)).toBeInTheDocument();
    expect(screen.getByText(/This model was produced: 2019 - 2022/)).toBeInTheDocument();
    expect(screen.getByText(/Road tax \(first year\): £405\.00/)).toBeInTheDocument();
  });

  it("renders massInServiceKg and taxationClass in Technical spec (previously fetched but never displayed)", () => {
    const vdi: VdiCheckResult = { ...minimalVdi, massInServiceKg: 213, taxationClass: "L3" };
    render(<VdiCheckReport vdiCheck={vdi} vehicleNoun="bike" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText(/Mass in service: 213 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Taxation class: L3/)).toBeInTheDocument();
  });

  it("hides the DVLA-registered engine capacity when it matches the manufacturer figure exactly (avoids a redundant duplicate row)", () => {
    const vdi: VdiCheckResult = { ...minimalVdi, engineCapacityCc: 650, dvlaEngineCapacityCc: 650 };
    render(<VdiCheckReport vdiCheck={vdi} vehicleNoun="bike" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText("Engine capacity: 650cc")).toBeInTheDocument();
    expect(screen.queryByText(/DVLA-registered engine capacity/)).not.toBeInTheDocument();
  });

  it("renders Dimensions when populated (confirmed against the Audi e-tron sample)", () => {
    const vdi: VdiCheckResult = { ...minimalVdi, heightMm: 1619, lengthMm: 4901, widthMm: 1935, wheelbaseLengthMm: 2928 };
    render(<VdiCheckReport vdiCheck={vdi} vehicleNoun="car" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText("Length: 4,901mm")).toBeInTheDocument();
    expect(screen.getByText("Width: 1,935mm")).toBeInTheDocument();
    expect(screen.getByText("Height: 1,619mm")).toBeInTheDocument();
    expect(screen.getByText("Wheelbase: 2,928mm")).toBeInTheDocument();
  });

  it("renders the unladen weight alongside kerb weight in Technical spec", () => {
    const vdi: VdiCheckResult = { ...minimalVdi, kerbWeightKg: 2370, unladenWeightKg: 2400 };
    render(<VdiCheckReport vdiCheck={vdi} vehicleNoun="car" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.getByText("Kerb weight: 2,370 kg")).toBeInTheDocument();
    expect(screen.getByText("Unladen weight: 2,400 kg")).toBeInTheDocument();
  });

  it("uses the vehicleNoun prop in every fallback message", () => {
    render(<VdiCheckReport vdiCheck={minimalVdi} vehicleNoun="bike" pricePaidPence={999} purchasedAt={null} expiresAt={null} />);
    expect(screen.queryByText(/Not available for this car/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Not available for this bike/).length).toBeGreaterThan(0);
  });
});
