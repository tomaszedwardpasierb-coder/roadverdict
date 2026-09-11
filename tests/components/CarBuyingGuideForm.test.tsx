// Place at: tests/components/CarBuyingGuideForm.test.tsx
// Mirrors BuyingGuideForm.test.tsx's own plate-lookup coverage - no
// "Model" field to assert against here (the car form only has
// brand/size/age), so a matched lookup is checked against "Make" only;
// car size can no longer be auto-filled at all (CAR_MODELS carries no
// engine-size data, and this lookup has no EngineCapacityCc either), so
// it always stays at whatever the buyer picks manually.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Real react-chartjs-2/chart.js rendering is exercised by
// VdiMileageChart.test.tsx directly - here it's enough to confirm this
// form renders (or doesn't render) that chart at all, so a lightweight
// stand-in avoids dragging real canvas rendering into every other test
// in this file.
vi.mock("react-chartjs-2", () => ({
  Line: () => <div data-testid="mileage-chart-line" />,
  Bar: () => <div data-testid="mileage-chart-bar" />,
}));

import { CarBuyingGuideForm } from "@/components/CarBuyingGuideForm";

describe("CarBuyingGuideForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.pushState({}, "", "/cars/buying-guide");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a sell description before any lookup, tailored to signed-in vs anonymous", () => {
    const { unmount } = render(<CarBuyingGuideForm signedIn />);
    expect(screen.getByText(/AI-written briefing on what to check before you buy/)).toBeInTheDocument();
    unmount();

    render(<CarBuyingGuideForm signedIn={false} />);
    expect(screen.getByText(/Sign in to search by registration/)).toBeInTheDocument();
    expect(screen.getByText(/cross-checked against DVLA, police and finance-house records/)).toBeInTheDocument();
  });

  it("renders all three steps with their default selections, including the electric car-size option", () => {
    render(<CarBuyingGuideForm signedIn />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("abarth");
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
    expect(screen.getByLabelText("Roughly how old")).toHaveValue("used");
    expect(screen.getByLabelText("Car size")).toContainHTML("Electric");
  });

  it("not signed in: attempting a lookup shows a sign-in prompt instead of calling the API", async () => {
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn={false} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/sign in to search by registration/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signed in: a matched plate renders MOT history and the AI briefing, and updates make (car size stays manual)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        fuelType: "Petrol",
        colour: "Blue",
        plateInRetention: false,
        motDueDate: "2026-06-01",
        motTests: [
          { testDate: "2025-06-01", passed: true, mileage: 24200, mileageTrusted: true, notes: "" },
          { testDate: "2024-06-01", passed: false, mileage: 19100, mileageTrusted: false, notes: "Nearside front tyre worn" },
        ],
        briefing: {
          motFlags: ["Failed its 2024 MOT on tyre wear"],
          modelNotes: ["Known for a dual-mass flywheel weak point on this generation"],
          summary: "Overall a solid, common family hatch with one past MOT fail worth asking about.",
        },
        vdiCheck: null,
        valuation: null,
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("ford"));
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
    expect(screen.getByText(/MOT due/)).toBeInTheDocument();
    expect(screen.getByText("Nearside front tyre worn")).toBeInTheDocument();
    expect(screen.getByText("Failed its 2024 MOT on tyre wear")).toBeInTheDocument();
    expect(screen.getByText("Known for a dual-mass flywheel weak point on this generation")).toBeInTheDocument();
    expect(screen.getByText(/solid, common family hatch/)).toBeInTheDocument();
  });

  it("a lookup result with no MOT test history at all says so plainly, without a briefing section", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        fuelType: "Petrol",
        colour: "Blue",
        plateInRetention: false,
        motDueDate: null,
        motTests: [],
        briefing: null,
        vdiCheck: null,
        valuation: null,
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/no mot due date on record/i)).toBeInTheDocument();
    expect(screen.getByText(/no mot test history found/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI-generated pre-purchase briefing/)).not.toBeInTheDocument();
  });

  // The explicit "that's a bike, not a car" rejection no longer exists -
  // MotHistoryDetails has no body-type field to classify vehicle kind
  // from at all. A motorcycle's plate now just resolves to whatever
  // brand match (or 'other') its make happens to hit.
  it("a motorcycle's plate resolves quietly to the 'other' brand rather than being rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ducati",
        model: "Monster",
        fuelType: "Petrol",
        colour: "Black",
        plateInRetention: false,
        motDueDate: "2026-01-01",
        motTests: [],
        briefing: null,
        vdiCheck: null,
        valuation: null,
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/MOT due/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("other");
  });

  it("submits the real form state to /api/cars/buying-guide and renders the returned checklist", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        checklist: {
          emphasis: "Check both the mechanicals and the price.",
          inspectionPoints: ["Timing belt history"],
          questionsForSeller: ["Any coolant top-ups?"],
        },
        addendum: "Check the running costs the seller mentions.",
        brandNotes: null,
        ageBandLabel: "Used (2000–2014)",
        carClassLabel: "Medium (1.3-2.0L)",
        brandLabel: "Ford",
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.selectOptions(screen.getByLabelText("Make"), "ford");
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByText("Timing belt history")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/buying-guide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ carClass: "medium", brand: "ford", ageBand: "used" }),
      })
    );
  });

  it("shows the server's own error message when the API responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Something specific went wrong server-side." }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong server-side.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });

  // ── Standalone, pay-per-use VDI check + free, rate-limited valuation ──

  it("shows the priced report CTA once a lookup succeeds without a vdiCheck yet", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null,
        vdiCheck: null, valuation: { privateAverage: 12000, privateClean: null, dealerForecourt: null, partExchange: null }, taxDetails: null,
        reportTier: "freeNoVehicle", reportPricePence: 1499, reportPriceLabel: "£14.99", proFreeAvailable: false, nextFreeReportAt: null,
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("button", { name: /Buy the vehicle history report - £14\.99/ })).toBeInTheDocument();
  });

  it("clicking Buy calls the checkout route with the current vrm and redirects to the returned url", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/cars/buying-guide-lookup")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
            plateInRetention: false, motDueDate: null, motTests: [], briefing: null,
            vdiCheck: null, valuation: null, taxDetails: null,
            reportTier: "freeNoVehicle", reportPricePence: 1499, reportPriceLabel: "£14.99", proFreeAvailable: false, nextFreeReportAt: null,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ url: "https://checkout.stripe.com/test-session" }) });
    });
    const originalLocation = window.location;
    // @ts-expect-error - deliberately replacing location to observe the redirect without jsdom navigating for real
    delete window.location;
    // @ts-expect-error - see above
    window.location = { ...originalLocation, href: "" };

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: /Buy the vehicle history report/ }));

    await waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/test-session"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cars/buying-guide-vdi-checkout",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ vrm: "AB12CDE" }) })
    );

    // @ts-expect-error - restoring the real Location object after the stub above
    window.location = originalLocation;
  });

  it("renders the independent VDI check facts and valuation figures once returned", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: true, writeOffRecordCount: 1, hasOutstandingFinance: false,
          financeRecords: [],
          keeperChanges: [
            { keeperStartDate: "2023-01-01", previousKeeperDisposalDate: "2022-06-01" },
            { keeperStartDate: "2024-06-01", previousKeeperDisposalDate: "2024-05-01" },
          ],
          keeperChangeCount: 2, plateChangeCount: 1, colourChangeCount: 1, currentColour: "Grey",
          v5cReissueCount: 2, calculatedAverageAnnualMileage: 9800, averageMileageForAge: 8000,
          mileageAnomalyDetected: true, manufacturerWarrantyMiles: 60000, manufacturerWarrantyMonths: 36,
        },
        valuation: { privateAverage: 23994, privateClean: null, dealerForecourt: 27161, partExchange: null },
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
        vdiCheckPricePaidPence: 1499,
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/1 write-off record\(s\) on file/)).toBeInTheDocument();
    expect(screen.getByText(/Vehicle history report - included with your £14\.99 purchase/)).toBeInTheDocument();
    expect(screen.getByText(/Bought 01\/01\/2026 - free to look up again until 15\/01\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/Colour: grey \(1 change\(s\) on record\)/)).toBeInTheDocument();
    expect(screen.getByText(/Average annual mileage: 9,800 mi\/year/)).toBeInTheDocument();
    expect(screen.getByText(/⚠️ anomaly flagged/)).toBeInTheDocument();
    expect(screen.getByText("Manufacturer warranty")).toBeInTheDocument();
    expect(screen.getByText(/36 months \/ 60,000 miles from new/)).toBeInTheDocument();
    expect(screen.getByText("Keeper change history")).toBeInTheDocument();
    expect(screen.getByText("Private average: £23,994")).toBeInTheDocument();
    expect(screen.getByText("Dealer forecourt: £27,161")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Buy the vehicle history report/ })).not.toBeInTheDocument();
  });

  // The fuller identity/technical-spec/PNC block added for the car
  // Buying Guide's report (see vdiCheckFetch.ts's BMW 640i sample).
  it("renders the identity, status, running-cost, technical-spec, performance, fuel-economy and PNC fact groups when present", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "PA63ERB", make: "BMW", model: "640i", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [],
          keeperChanges: [{ keeperStartDate: "2020-01-01T00:00:00Z", previousKeeperDisposalDate: null, numberOfPreviousKeepers: 2 }],
          keeperChangeCount: 1,
          plateChanges: [{ currentVrm: "PA63ERB", previousVrm: "OLD123", dateOfTransaction: "2015-05-01T00:00:00Z" }],
          plateChangeCount: 1, colourChangeCount: 0, currentColour: "Black", originalColour: "Black", previousColour: null,
          v5cReissueCount: 1, calculatedAverageAnnualMileage: null, averageMileageForAge: null,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
          series: "F13", platformName: "L6", countryOfOrigin: "Germany", dvlaFuelType: "PETROL",
          bodyStyle: "Coupe", dvlaBodyType: "COUPE", dvlaWheelPlan: "2 AXLE RIGID BODY",
          dateFirstRegisteredInUk: "2013-09-10T00:00:00Z", dateOfManufacture: "2013-09-10T00:00:00Z",
          isImported: true, isImportedFromOutsideEu: false, isScrapped: false, certificateOfDestructionIssued: false,
          vedStandardSixMonths: 68.75, vedStandardTwelveMonths: 200, dvlaCo2: 181, dvlaCo2Band: "I", euroStatus: "5b",
          kerbWeightKg: 1685, grossCombinedWeightKg: 2180, fuelTankCapacityLitres: 70,
          cylinderArrangement: "Inline", numberOfCylinders: 6, aspiration: "Turbocharged",
          transmissionType: "Automatic", numberOfGears: 8, drivingAxle: "Rear",
          bhp: 315, ps: 319.5, torqueNm: 450, torqueRpm: 1300,
          zeroToSixtyMph: 5.3, zeroToOneHundredKph: null, maxSpeedMph: 155, maxSpeedKph: 250,
          soundLevels: { stationaryDb: 90, driveByDb: 79, engineSpeedRpm: 4200 },
          fuelEconomy: {
            urbanColdMpg: 26.4, extraUrbanMpg: 47.1, combinedMpg: 36.2,
            urbanColdL100Km: 10.7, extraUrbanL100Km: 6.0, combinedL100Km: 7.8,
          },
          pncDetail: {
            policeForceName: "Metropolitan Police", currentStatusOnRecord: "Recovered",
            dateReportedStolen: "2021-05-01T00:00:00Z", dateRecordAddedToPnc: "2021-05-02T00:00:00Z",
          },
          mileageReadings: [
            { date: "2021-06-01T00:00:00Z", mileage: 11000, inSequence: true, dataSource: "MOT" },
            { date: "2022-06-01T00:00:00Z", mileage: 14000, inSequence: true, dataSource: "MOT" },
          ],
        },
        valuation: null,
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
        vdiCheckPricePaidPence: 1499,
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "PA63ERB");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/Series: F13/)).toBeInTheDocument();
    expect(screen.getByText(/Platform: L6/)).toBeInTheDocument();
    expect(screen.getByText(/Country of origin: Germany/)).toBeInTheDocument();
    expect(screen.getByText(/DVLA fuel type: PETROL/)).toBeInTheDocument();
    expect(screen.getByText(/Body style: Coupe/)).toBeInTheDocument();
    expect(screen.getByText(/DVLA body type: COUPE/)).toBeInTheDocument();
    expect(screen.getByText(/Wheel plan: 2 AXLE RIGID BODY/)).toBeInTheDocument();
    expect(screen.getByText(/First registered in the UK: 10\/09\/2013/)).toBeInTheDocument();
    expect(screen.getByText(/Date of manufacture: 10\/09\/2013/)).toBeInTheDocument();

    expect(screen.getByText(/Current keeper since 01\/01\/2020 \(2 previous keeper\(s\)\)/)).toBeInTheDocument();

    expect(screen.getByText(/Imported/)).toBeInTheDocument();

    expect(screen.getByText(/Road tax \(6 months\): £68\.75/)).toBeInTheDocument();
    expect(screen.getByText(/Road tax \(12 months\): £200\.00/)).toBeInTheDocument();
    expect(screen.getByText(/DVLA CO2: 181 g\/km \(band I\)/)).toBeInTheDocument();
    expect(screen.getByText(/Euro status: 5b/)).toBeInTheDocument();

    expect(screen.getByText(/Engine: Inline, 6 cylinders, Turbocharged/)).toBeInTheDocument();
    expect(screen.getByText(/Transmission: Automatic, 8-speed, Rear drive/)).toBeInTheDocument();
    expect(screen.getByText(/Kerb weight: 1,685 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Gross combined weight: 2,180 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Fuel tank: 70 litres/)).toBeInTheDocument();

    expect(screen.getByText(/Power: 315 bhp \/ 319\.5 PS/)).toBeInTheDocument();
    expect(screen.getByText(/Torque: 450 Nm at 1,300 rpm/)).toBeInTheDocument();
    expect(screen.getByText(/0-60mph: 5\.3s/)).toBeInTheDocument();
    expect(screen.getByText(/Max speed: 155mph \/ 250kph/)).toBeInTheDocument();
    expect(screen.getByText(/Sound level: 90dB stationary, 79dB drive-by at 4,200 rpm/)).toBeInTheDocument();

    expect(screen.getByText(/Urban \(cold\): 26\.4mpg \(10\.7L\/100km\)/)).toBeInTheDocument();
    expect(screen.getByText(/Extra urban: 47\.1mpg \(6L\/100km\)/)).toBeInTheDocument();
    expect(screen.getByText(/Combined: 36\.2mpg \(7\.8L\/100km\)/)).toBeInTheDocument();

    expect(screen.getByText(/Police force: Metropolitan Police/)).toBeInTheDocument();
    expect(screen.getByText(/Current status: Recovered/)).toBeInTheDocument();
    expect(screen.getByText(/Reported stolen: 01\/05\/2021/)).toBeInTheDocument();
    expect(screen.getByText(/Added to PNC: 02\/05\/2021/)).toBeInTheDocument();

    expect(screen.getByText("Plate change history")).toBeInTheDocument();
    expect(screen.getByText(/OLD123 → PA63ERB \(01\/05\/2015\)/)).toBeInTheDocument();

    expect(screen.getByText("Mileage history")).toBeInTheDocument();
    expect(screen.getByTestId("mileage-chart-bar")).toBeInTheDocument();
  });

  it("doesn't render a mileage chart when mileageReadings is absent or has fewer than 2 entries", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null, valuation: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [], keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
          mileageReadings: [{ date: "2021-06-01T00:00:00Z", mileage: 11000, inSequence: true, dataSource: "MOT" }],
        },
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
        vdiCheckPricePaidPence: 1499,
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText("Mileage integrity")).toBeInTheDocument();
    expect(screen.queryByText("Mileage history")).not.toBeInTheDocument();
    expect(screen.queryByTestId("mileage-chart-bar")).not.toBeInTheDocument();
  });

  // EV-specific fields, mirroring the real Audi e-tron VDICheck sample
  // (WP22FUT) this block was built from - dual-motor AWD, 2 charge
  // ports, a single battery pack, NCAP rating, and the general
  // (non-EV-only) fields that sample also revealed: DriveType, torque
  // LbFt, power Kw/Rpm, manufacturer-quoted CO2.
  it("renders the EV powertrain groups (battery, motors with diffing, charge ports, range) alongside the general fields that sample also revealed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "WP22FUT", make: "Audi", model: "e-tron", fuelType: "Electric", colour: "Grey",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null, valuation: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [], keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: "Grey",
          v5cReissueCount: 1, calculatedAverageAnnualMileage: 8233, averageMileageForAge: 48000,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: 60000, manufacturerWarrantyMonths: 36,

          powertrainType: "BEV",
          driveType: "4x4",
          drivingAxle: "All Permanent",
          transmissionType: "Automatic",
          numberOfGears: 1,
          manufacturerCo2: 0,
          torqueNm: 664, torqueLbFt: 490, torqueRpm: 5800,
          bhp: 308.4, ps: 312.7, powerKw: 230, powerRpm: 5800,

          ncapStarRating: 5, ncapChildPercent: 85, ncapAdultPercent: 91, ncapPedestrianPercent: 71, ncapSafetyAssistPercent: 76,

          isTeslaSuperchargerCompatible: false,
          chargePorts: [
            {
              portType: "Type 2", locationOnVehicle: "Left/Front", maxChargePowerKw: 11, isStandardChargePort: true,
              chargeTimes: [
                { chargePortKw: 2.3, timeInMinutes: 1441 },
                { chargePortKw: 7.5, timeInMinutes: 442 },
                { chargePortKw: 11, timeInMinutes: 301 },
              ],
            },
            {
              portType: "CCS", locationOnVehicle: "Right/Front", maxChargePowerKw: 120, isStandardChargePort: true,
              chargeTimes: [
                { chargePortKw: 50, timeInMinutes: 66 },
                { chargePortKw: 100, timeInMinutes: 33 },
                { chargePortKw: 150, timeInMinutes: 28 },
              ],
            },
          ],
          batteries: [
            { locationOnVehicle: "Under Floor/Middle", totalCapacityKwh: 71, usableCapacityKwh: 64, chemistry: "Lithium-Ion 375V", warrantyMonths: 96, warrantyMiles: 100000 },
          ],
          motors: [
            { motorType: "Permanent magnet synchronous", manufacturer: "Audi", model: "E-Tron", motorLocation: "Front", powerKw: 215, maxTorqueNm: 332, axleDrivenByMotor: "Front", supportsRegenerativeBraking: true, additionalInformation: null },
            { motorType: "Permanent magnet synchronous", manufacturer: "Audi", model: "E-Tron", motorLocation: "Rear", powerKw: 215, maxTorqueNm: 332, axleDrivenByMotor: "Rear", supportsRegenerativeBraking: true, additionalInformation: null },
          ],
          evTransmissions: [{ transmissionType: "Automatic", numberOfGears: 1 }],
          evWhPerMile: 394,
          evMaxChargeInputPowerKw: null,
          evRealRangeMiles: null,
          evMilesPerChargeHour: 304,
          evZeroEmissionMiles: 180,
          evRangeTestCycles: [{ testType: "WLTP", combinedRangeMiles: 180, combinedRangeKm: 289.68, cityRangeMiles: null, cityRangeKm: null }],
        },
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
        vdiCheckPricePaidPence: 1499,
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "WP22FUT");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/Powertrain type: BEV/)).toBeInTheDocument();

    expect(screen.getByText("Euro NCAP safety rating")).toBeInTheDocument();
    expect(screen.getByText(/Overall: 5 \/ 5 stars/)).toBeInTheDocument();
    expect(screen.getByText(/Adult occupant: 91%/)).toBeInTheDocument();
    expect(screen.getByText(/Pedestrian: 71%/)).toBeInTheDocument();

    expect(screen.getByText(/Transmission: Automatic, 1-speed, 4x4, All Permanent drive/)).toBeInTheDocument();
    expect(screen.getByText(/Manufacturer-quoted CO2: 0 g\/km/)).toBeInTheDocument();
    expect(screen.getByText(/Power: 308\.4 bhp \/ 312\.7 PS \/ 230kW at 5,800 rpm/)).toBeInTheDocument();
    expect(screen.getByText(/Torque: 664 Nm \(490 lb-ft\) at 5,800 rpm/)).toBeInTheDocument();

    // The EV-specific TransmissionDetailsList is a pure duplicate of the
    // top-level Transmission fields in this sample (Automatic/1-speed
    // already shown above) - must NOT render a second time.
    expect(screen.queryByText(/EV transmission/)).not.toBeInTheDocument();

    expect(screen.getByText("Battery")).toBeInTheDocument();
    expect(screen.getByText(/71kWh total, 64kWh usable, Lithium-Ion 375V, Under Floor\/Middle/)).toBeInTheDocument();
    expect(screen.getByText(/battery warranty: 96 months \/ 100,000 miles/)).toBeInTheDocument();

    expect(screen.getByText("Motors")).toBeInTheDocument();
    expect(screen.getByText(/Motor 1 - Front/)).toBeInTheDocument();
    expect(screen.getByText(/Motor 2 - Rear/)).toBeInTheDocument();
    // Motor 2 is otherwise identical to Motor 1 - only its axle should
    // show up as a difference, not every repeated field.
    expect(screen.getByText("Axle driven: Rear")).toBeInTheDocument();
    // Shared between both motors in this sample - shown once (motor 1's
    // full card), not repeated a second time for motor 2's diff-only list.
    expect(screen.getAllByText("Type: Permanent magnet synchronous")).toHaveLength(1);
    expect(screen.getAllByText("Power: 215kW")).toHaveLength(1);

    expect(screen.queryByText(/Charge ports \(Tesla Supercharger compatible\)/)).not.toBeInTheDocument(); // this sample isn't Supercharger-compatible
    expect(screen.getByText("Charge ports")).toBeInTheDocument();
    expect(screen.getByText(/Charge port 1 of 2: Type 2, Left\/Front, max 11kW, standard/)).toBeInTheDocument();
    expect(screen.getByText(/Charge port 2 of 2: CCS, Right\/Front, max 120kW, standard/)).toBeInTheDocument();
    expect(screen.getByText("2.3kW")).toBeInTheDocument();
    expect(screen.getByText("24h 1m")).toBeInTheDocument(); // 1441 minutes
    expect(screen.getByText("28m")).toBeInTheDocument(); // 150kW row, 28 minutes

    expect(screen.getByText("EV performance & range")).toBeInTheDocument();
    expect(screen.getByText(/Efficiency: 394Wh\/mile/)).toBeInTheDocument();
    expect(screen.getByText(/Zero-emission range: 180 miles/)).toBeInTheDocument();
    expect(screen.getByText(/Miles added per hour of charge: 304/)).toBeInTheDocument();
    expect(screen.getByText(/WLTP range: 180 miles combined \(289\.68km\)/)).toBeInTheDocument();

    // MPG genuinely doesn't apply to a BEV - no empty "Fuel economy"
    // header should render when every one of its sub-fields is null.
    expect(screen.queryByText("Fuel economy")).not.toBeInTheDocument();
  });

  it("shows the valuation cooldown message when the free/Pro allowance is used up, independent of the VDI purchase state", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: null, valuation: null, valuationBlockedReason: "cooldown", valuationAvailableAt: "2026-02-01T00:00:00.000Z",
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/next one is available from/)).toBeInTheDocument();
  });

  it("shows the already-used message and a fresh Buy button when a purchase has already been consumed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: null, vdiCheckBlockedReason: "already_used", valuation: null,
        reportTier: "freeNoVehicle", reportPricePence: 1499, reportPriceLabel: "£14.99", proFreeAvailable: false, nextFreeReportAt: null,
      }),
    });
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already been used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy the vehicle history report/ })).toBeInTheDocument();
  });

  it("on load, a Stripe return with vdiPurchaseId and vrm in the URL auto-fills the plate and runs the paid lookup", async () => {
    window.history.pushState({}, "", "/cars/buying-guide?vdiPurchaseId=purchase123&vrm=AB12CDE&session_id=cs_test_123");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Ford", model: "Focus", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null, valuation: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [], keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
        },
      }),
    });

    render(<CarBuyingGuideForm signedIn />);

    await waitFor(() => expect(screen.getByLabelText("Search by registration (optional)")).toHaveValue("AB12CDE"));
    expect(await screen.findByText(/1 keeper change\(s\) on record/)).toBeInTheDocument();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("vdiPurchaseId=purchase123");
    expect(calledUrl).toContain("session_id=cs_test_123");
    expect(window.location.search).toBe("");
  });
});
