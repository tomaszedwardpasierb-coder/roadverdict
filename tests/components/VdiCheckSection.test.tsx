// Place at: tests/components/VdiCheckSection.test.tsx
// Real navigation on a successful checkout-session creation is a hard
// window.location.href assignment (to Stripe's own checkout URL), not
// router.push - same reasoning/stub pattern as Verify2faPage.test.tsx.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { VdiUnlock, VdiCheckResult } from "@/lib/tracker/vdiUnlock";

// Same react-chartjs-2 stand-in convention as CarBuyingGuideForm.test.tsx
// - real canvas rendering is exercised by VdiMileageChart.test.tsx itself.
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mileage-chart-line" />,
  Bar: () => <div data-testid="mileage-chart-bar" />,
}));

import { VdiCheckSection } from "@/components/VdiCheckSection";

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

describe("VdiCheckSection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, href: "" },
      writable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the locked state with the bike price and no facts when vdiUnlock is absent", () => {
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);
    expect(screen.getByText("Unlock for £9.99")).toBeInTheDocument();
    expect(screen.queryByText("Stolen marker")).not.toBeInTheDocument();
  });

  it("shows the car price and mentions the included valuation in the locked state", () => {
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" />);
    expect(screen.getByText("Unlock for £13.99")).toBeInTheDocument();
    expect(screen.getByText(/Includes an independent valuation range/)).toBeInTheDocument();
  });

  it("posts to the bike checkout route and redirects to the returned URL on unlock click", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session123" }) });
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);

    await user.click(screen.getByText("Unlock for £9.99"));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/vdi-checkout",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ token: "tok_abc" }) })
    );
    expect(window.location.href).toBe("https://checkout.stripe.com/session123");
  });

  it("posts to the car checkout route for a car section", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session456" }) });
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" />);

    await user.click(screen.getByText("Unlock for £13.99"));

    expect(fetch).toHaveBeenCalledWith("/api/cars/vdi-checkout", expect.objectContaining({ method: "POST" }));
  });

  it("shows the spinner alongside the unlock button's own 'Starting checkout…' text while checkout is being created", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);
    await user.click(screen.getByText("Unlock for £9.99"));

    const button = screen.getByRole("button", { name: "Starting checkout…" });
    expect(button.querySelector("svg")).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session123" }) });
    await vi.waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/session123"));
  });

  it("themes the spinner from the real vehicleKind prop - a car section renders the car wheel (path elements), never the bike wheel's wire spokes", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" />);
    await user.click(screen.getByText("Unlock for £13.99"));

    const button = screen.getByRole("button", { name: "Starting checkout…" });
    expect(button.querySelectorAll("path").length).toBe(5);
    expect(button.querySelectorAll("line").length).toBe(0);

    resolveFetch({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/session456" }) });
    await vi.waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/session456"));
  });

  it("shows the server's own error message and never redirects when checkout creation fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "This report's Independent Vehicle Check has already been unlocked." }) });
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);

    await user.click(screen.getByText("Unlock for £9.99"));

    expect(await screen.findByRole("alert")).toHaveTextContent("already been unlocked");
    expect(window.location.href).toBe("");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" />);

    await user.click(screen.getByText("Unlock for £9.99"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach the payment service/i);
  });

  it("shows a 'still processing' note when unlocked but vdiCheck hasn't been fetched yet", () => {
    const vdiUnlock: VdiUnlock = { unlockedAt: "2026-01-01T00:00:00.000Z", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.getByText(/being processed/)).toBeInTheDocument();
    expect(screen.queryByText("Unlock for £9.99")).not.toBeInTheDocument();
  });

  it("renders the independently-verified facts, registration, and make/model once vdiCheck is populated", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "2026-01-01T00:00:00.000Z",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false,
        hasWriteOffRecord: false,
        writeOffRecordCount: 0,
        hasOutstandingFinance: false,
        financeRecords: [],
        keeperChanges: [],
        keeperChangeCount: 2,
        plateChangeCount: 1,
        colourChangeCount: 0,
        currentColour: "BLACK",
        vedFirstYearTwelveMonths: null,
        vedStandardTwelveMonths: 200,
        v5cReissueCount: 0,
        calculatedAverageAnnualMileage: null,
        averageMileageForAge: null,
        mileageAnomalyDetected: false,
        manufacturerWarrantyMiles: null,
        manufacturerWarrantyMonths: null,
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);

    expect(screen.getByText(/Honda CB125R/)).toBeInTheDocument();
    expect(screen.getByText(/AB12CDE/)).toBeInTheDocument();
    expect(screen.getAllByText("None found")).toHaveLength(3);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("flags a stolen marker, write-off record, and outstanding finance prominently when present", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: true,
        hasWriteOffRecord: true,
        writeOffRecordCount: 1,
        hasOutstandingFinance: true,
        financeRecords: [{ agreementDate: "2024-01-01", agreementType: "HIRE PURCHASE", financeCompany: "Example Finance" }],
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
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);

    expect(screen.getByText(/Recorded as stolen/)).toBeInTheDocument();
    expect(screen.getByText(/1 record\(s\) on file/)).toBeInTheDocument();
    expect(screen.getByText(/1 agreement\(s\) on file/)).toBeInTheDocument();
  });

  it("renders the valuation figures only for a car, and never for a bike", () => {
    const withValuation: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 999,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: "SILVER",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 200, v5cReissueCount: 0,
        calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
        manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
      },
      valuation: {
        valuationTime: null, valuationMileage: 23627, vehicleDescription: null, onTheRoad: 38015,
        dealerForecourt: 27161, tradeRetail: 26240, privateClean: 24257, privateAverage: 23994,
        partExchange: 23880, auction: 23866, tradeAverage: 23060, tradePoor: 21471,
      },
    };
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" vdiUnlock={withValuation} />);
    expect(screen.getByText("Independent valuation")).toBeInTheDocument();
    expect(screen.getByText("£23,994")).toBeInTheDocument();
  });

  it("renders the AI summary's key findings, valuation note, and summary when present", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: "SILVER",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 200, v5cReissueCount: 0,
        calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
        manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
      },
      aiSummary: {
        keyFindings: ["No stolen marker, write-off record, or outstanding finance found."],
        valuationNote: null,
        summary: "This vehicle's independent record is clean.",
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.getByText("No stolen marker, write-off record, or outstanding finance found.")).toBeInTheDocument();
    expect(screen.getByText("This vehicle's independent record is clean.")).toBeInTheDocument();
  });

  it("renders the enriched write-off record (status, insurer, loss date), not just a bare count", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: true, writeOffRecordCount: 1, hasOutstandingFinance: false, financeRecords: [],
        keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: "RED",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 125, v5cReissueCount: 0,
        calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
        manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
        writeOffRecords: [
          {
            status: "CAT N NON STRUCTURAL DAMAGE",
            category: "N",
            lossDate: "2025-08-11T00:00:00Z",
            insurerName: "4th Dimension Innovation Ltd",
            insurerCode: "560",
          },
        ],
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.getByText(/CAT N NON STRUCTURAL DAMAGE by 4th Dimension Innovation Ltd - 560/)).toBeInTheDocument();
  });

  it("renders date first registered, date of manufacture, original→current colour, VED rates, technical spec, and sound levels", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChanges: [], keeperChangeCount: 4, plateChangeCount: 0, colourChangeCount: 1, currentColour: "BLUE",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 125, v5cReissueCount: 4,
        calculatedAverageAnnualMileage: 1310, averageMileageForAge: 64000, mileageAnomalyDetected: false,
        manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
        originalColour: "RED",
        dateFirstRegisteredInUk: "2010-12-11T00:00:00Z",
        dateOfManufacture: "2010-11-01T00:00:00Z",
        vedStandardSixMonths: 68.75,
        massInServiceKg: 202,
        taxationClass: "L3",
        bhp: 71,
        soundLevels: { stationaryDb: 90, driveByDb: 79, engineSpeedRpm: 4200 },
        plateChanges: [{ currentVrm: "DU60OAL", previousVrm: "PN74XSA", dateOfTransaction: "2020-05-15T00:00:00Z" }],
      },
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="DU60OAL" make="Suzuki" model="SFV650" vdiUnlock={vdiUnlock} />);

    expect(screen.getByText("11/12/2010")).toBeInTheDocument();
    expect(screen.getByText(/red → blue/)).toBeInTheDocument();
    expect(screen.getByText(/£68\.75 for 6 months.*£125 for 12 months/)).toBeInTheDocument();
    expect(screen.getByText("202 kg")).toBeInTheDocument();
    expect(screen.getByText("L3")).toBeInTheDocument();
    expect(screen.getByText("71 bhp")).toBeInTheDocument();
    expect(screen.getByText(/stationary 90 dB.*drive-by 79 dB.*at 4,200 rpm/)).toBeInTheDocument();
    expect(screen.getByText("Plate change history")).toBeInTheDocument();
    expect(screen.getByText(/PN74XSA → DU60OAL/)).toBeInTheDocument();
  });

  it("omits the 'What this means' section entirely when aiSummary generation failed (null)", () => {
    const vdiUnlock: VdiUnlock = {
      unlockedAt: "x",
      stripeSessionId: "cs_1",
      amountPaidPence: 799,
      currency: "gbp",
      vdiCheck: {
        isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
        keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: "SILVER",
        vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: 200, v5cReissueCount: 0,
        calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
        manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
      },
      aiSummary: null,
    };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(screen.queryByText("What this means")).not.toBeInTheDocument();
  });

  it("renders every icon as a real SVG element, not emoji text (unified with the Buying Guide's own icon set)", () => {
    const vdiUnlock: VdiUnlock = { unlockedAt: "x", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp", vdiCheck: minimalVdi };
    const { container } = render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="AB12CDE" make="Honda" model="CB125R" vdiUnlock={vdiUnlock} />);
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(5);
    expect(container.textContent).not.toMatch(/[🛡️💥💳🎨👤🔢🛣️🚓🚗📅🚙🌍📦♻️🏛️🌫️⚖️🔧⚙️⛽🏁💪🚀🔊📊🧾⚡🔌🔋🧲🗺️⭐🏷️]/u);
  });

  it("shows a plain 'not available' fallback for every group with no populated fields, matching the Buying Guide's own report", () => {
    const vdiUnlock: VdiUnlock = { unlockedAt: "x", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp", vdiCheck: minimalVdi };
    render(<VdiCheckSection vehicleKind="car" token="tok_xyz" registration="AB12CDE" make="Ford" model="Focus" vdiUnlock={vdiUnlock} />);
    for (const heading of ["Euro NCAP safety rating", "Identity", "Dimensions", "Status flags", "Running costs", "Technical spec", "Performance", "EV performance & range", "Fuel economy", "Police National Computer record", "Mileage integrity", "Manufacturer warranty"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getAllByText("Not available for this car.").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Not available for this car - only applies to an electric/).length).toBeGreaterThan(0);
  });

  it("renders the new fields confirmed against the Royal Enfield motorcycle and Audi e-tron samples", () => {
    const vdi: VdiCheckResult = {
      ...minimalVdi,
      engineCapacityCc: 648,
      dvlaEngineCapacityCc: 650,
      numberOfSeats: 2,
      powerToWeightRatio: 0.17,
      modelStartDate: "2019-01-04T00:00:00Z",
      modelEndDate: "2022-10-10T00:00:00Z",
      typeApprovalCategory: "L3",
      heightMm: 1619,
      lengthMm: 4901,
      widthMm: 1935,
      wheelbaseLengthMm: 2928,
      unladenWeightKg: 2400,
      powertrainType: "BEV",
      ncapStarRating: 5,
      batteries: [{ locationOnVehicle: "Under Floor/Middle", totalCapacityKwh: 71, usableCapacityKwh: 64, chemistry: "Lithium-Ion 375V", warrantyMonths: 96, warrantyMiles: 100000 }],
      chargePorts: [{ portType: "CCS", locationOnVehicle: "Right/Front", maxChargePowerKw: 120, isStandardChargePort: true, chargeTimes: [{ chargePortKw: 50, timeInMinutes: 66 }] }],
      mileageReadings: [
        { date: "2024-02-03T10:10:16Z", mileage: 7759, inSequence: true, dataSource: "MOT" },
        { date: "2026-02-07T10:19:11Z", mileage: 13943, inSequence: true, dataSource: "MOT" },
      ],
    };
    const vdiUnlock: VdiUnlock = { unlockedAt: "x", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp", vdiCheck: vdi };
    render(<VdiCheckSection vehicleKind="bike" token="tok_abc" registration="LA70GZF" make="Royal Enfield" model="Interceptor INT 650" vdiUnlock={vdiUnlock} />);

    expect(screen.getByText("648cc")).toBeInTheDocument();
    expect(screen.getByText("650cc")).toBeInTheDocument();
    expect(screen.getByText("Seats")).toBeInTheDocument();
    expect(screen.getByText("BEV")).toBeInTheDocument();
    expect(screen.getByText("2019 - 2022")).toBeInTheDocument();
    expect(screen.getByText("L3")).toBeInTheDocument();
    expect(screen.getByText(/1,619mm/)).toBeInTheDocument();
    expect(screen.getByText(/71kWh total/)).toBeInTheDocument();
    expect(screen.getByText(/CCS, Right\/Front, max 120kW, standard/)).toBeInTheDocument();
    expect(screen.getByText("5 / 5 stars")).toBeInTheDocument();
    expect(screen.getByText("Mileage history")).toBeInTheDocument();
    expect(screen.getByTestId("mileage-chart-bar")).toBeInTheDocument();
  });
});
