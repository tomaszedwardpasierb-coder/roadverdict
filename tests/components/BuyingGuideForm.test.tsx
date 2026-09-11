// Place at: tests/components/BuyingGuideForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuyingGuideForm } from "@/components/BuyingGuideForm";

describe("BuyingGuideForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.pushState({}, "", "/buying-guide");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a sell description before any lookup, tailored to signed-in vs anonymous", () => {
    const { unmount } = render(<BuyingGuideForm signedIn />);
    expect(screen.getByText(/AI-written briefing on what to check before you buy/)).toBeInTheDocument();
    unmount();

    render(<BuyingGuideForm signedIn={false} />);
    expect(screen.getByText(/Sign in to search by registration/)).toBeInTheDocument();
    expect(screen.getByText(/cross-checked against DVLA, police and finance-house records/)).toBeInTheDocument();
  });

  it("signed in: a matched plate renders MOT history, the AI briefing, and updates the picked model", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Honda",
        model: "CB125R",
        fuelType: "Petrol",
        colour: "Black",
        plateInRetention: false,
        motDueDate: "2026-06-01",
        motTests: [
          { testDate: "2025-06-01", passed: true, mileage: 4200, mileageTrusted: true, notes: "" },
          { testDate: "2024-06-01", passed: false, mileage: 3100, mileageTrusted: false, notes: "Front tyre worn" },
        ],
        briefing: {
          motFlags: ["Failed its 2024 MOT on tyre wear"],
          modelNotes: ["Known for a recall on early chain guards"],
          summary: "Overall a solid, common commuter with one past MOT fail worth asking about.",
        },
        vdiCheck: null,
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue("CB125R"));
    expect(screen.getByText(/MOT due/)).toBeInTheDocument();
    expect(screen.getByText("Front tyre worn")).toBeInTheDocument();
    expect(screen.getByText("Failed its 2024 MOT on tyre wear")).toBeInTheDocument();
    expect(screen.getByText("Known for a recall on early chain guards")).toBeInTheDocument();
    expect(screen.getByText(/solid, common commuter/)).toBeInTheDocument();
  });

  it("a lookup result with no MOT test history at all says so plainly, without a briefing section", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Honda",
        model: "CB125R",
        fuelType: "Petrol",
        colour: "Black",
        plateInRetention: false,
        motDueDate: null,
        motTests: [],
        briefing: null,
        vdiCheck: null,
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/no mot due date on record/i)).toBeInTheDocument();
    expect(screen.getByText(/no mot test history found/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI-generated pre-purchase briefing/)).not.toBeInTheDocument();
  });

  // The explicit "that's a car, not a bike" rejection no longer exists -
  // MotHistoryDetails has no body-type field to classify vehicle kind
  // from at all. A four-wheeled vehicle's plate now just resolves to
  // whatever brand match (or 'other') its make happens to hit.
  it("a car's plate resolves quietly to the 'other' brand rather than being rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        fuelType: "Petrol",
        colour: "Blue",
        plateInRetention: false,
        motDueDate: "2026-01-01",
        motTests: [],
        briefing: null,
        vdiCheck: null,
        taxDetails: null,
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/MOT due/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("other");
  });

  it("submits real form state to /api/buying-guide and renders the checklist, including brand-specific notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        checklist: {
          emphasis: "Check the chain and sprockets closely.",
          inspectionPoints: ["Chain wear", "Tyre tread"],
          questionsForSeller: ["Any recent services?"],
        },
        addendum: "Ask for a full service history if not already provided.",
        brandNotes: ["Early units had a known clutch rattle - listen for it on start-up."],
        ageBandLabel: "Used",
        bikeClassLabel: "Medium (401-750cc)",
        brandLabel: "Honda",
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByText("Check the chain and sprockets closely.")).toBeInTheDocument();
    expect(screen.getByText("Chain wear")).toBeInTheDocument();
    expect(screen.getByText(/Specific to Honda/)).toBeInTheDocument();
    expect(screen.getByText(/clutch rattle/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/buying-guide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bikeClass: "medium", brand: "honda", ageBand: "used" }),
      })
    );
  });

  it("omits the brand-specific section entirely when the API returns no brand notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        checklist: { emphasis: "General checks apply.", inspectionPoints: ["Tyre tread"], questionsForSeller: [] },
        addendum: "Nothing brand-specific to flag here.",
        brandNotes: null,
        ageBandLabel: "Used",
        bikeClassLabel: "Medium (401-750cc)",
        brandLabel: "Other",
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByText("General checks apply.")).toBeInTheDocument();
    expect(screen.queryByText(/Specific to/)).not.toBeInTheDocument();
  });

  // ── Standalone, pay-per-use VDI check ─────────────────────────────────

  it("shows the priced report CTA once a lookup succeeds without a vdiCheck yet", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, vdiCheck: null, taxDetails: null,
        reportTier: "freeNoVehicle", reportPricePence: 1499, reportPriceLabel: "£14.99", proFreeAvailable: false, nextFreeReportAt: null,
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("button", { name: /Buy the vehicle history report - £14\.99/ })).toBeInTheDocument();
    expect(screen.getByText(/Add a vehicle to your garage to unlock £12\.99/)).toBeInTheDocument();
  });

  it("shows the free-report CTA for a Pro account with its allowance available", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, vdiCheck: null, taxDetails: null,
        reportTier: "pro", reportPricePence: 0, reportPriceLabel: "£9.99", proFreeAvailable: true, nextFreeReportAt: null,
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("button", { name: /Get your free vehicle history report/ })).toBeInTheDocument();
  });

  it("shows the priced CTA and next-free-date note for a Pro account off its allowance", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, vdiCheck: null, taxDetails: null,
        reportTier: "pro", reportPricePence: 999, reportPriceLabel: "£9.99", proFreeAvailable: false, nextFreeReportAt: "2026-02-01T00:00:00.000Z",
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("button", { name: /Buy the vehicle history report - £9\.99/ })).toBeInTheDocument();
    expect(screen.getByText(/Your next free report is available 01\/02\/2026/)).toBeInTheDocument();
  });

  it("clicking Buy calls the checkout route with the current vrm and redirects to the returned url", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/tracker/buying-guide-lookup")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
            plateInRetention: false, motDueDate: null, motTests: [], briefing: null, vdiCheck: null, taxDetails: null,
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
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: /Buy the vehicle history report/ }));

    await waitFor(() => expect(window.location.href).toBe("https://checkout.stripe.com/test-session"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tracker/buying-guide-vdi-checkout",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ vrm: "AB12CDE" }) })
    );

    // @ts-expect-error - restoring the real Location object after the stub above
    window.location = originalLocation;
  });

  it("a Pro free-allowance grant re-runs the lookup directly, with no Stripe redirect", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    let lookupCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/tracker/buying-guide-lookup")) {
        lookupCalls += 1;
        if (lookupCalls === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
              plateInRetention: false, motDueDate: null, motTests: [], briefing: null, vdiCheck: null, taxDetails: null,
              reportTier: "pro", reportPricePence: 0, reportPriceLabel: "£9.99", proFreeAvailable: true, nextFreeReportAt: null,
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
            plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
            vdiCheck: {
              isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
              financeRecords: [], keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
              v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null,
              mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
            },
            vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
            vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
            vdiCheckPricePaidPence: 0,
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ freeReportReady: true, vdiPurchaseId: "free-purchase-1" }) });
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await user.click(await screen.findByRole("button", { name: /Get your free vehicle history report/ }));

    expect(await screen.findByText(/your free Premium report/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tracker/buying-guide-vdi-checkout",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ vrm: "AB12CDE" }) })
    );
    const secondLookupUrl = fetchMock.mock.calls[2][0] as string;
    expect(secondLookupUrl).toContain("vdiPurchaseId=free-purchase-1");
    expect(window.location.search).toContain("vdiPurchaseId=free-purchase-1");
  });

  it("renders the independent VDI check facts once returned", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: {
          isStolen: true, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [],
          keeperChanges: [
            { keeperStartDate: "2023-01-01", previousKeeperDisposalDate: "2022-06-01" },
            { keeperStartDate: "2024-06-01", previousKeeperDisposalDate: "2024-05-01" },
          ],
          keeperChangeCount: 2, plateChangeCount: 1, colourChangeCount: 0, currentColour: null,
          v5cReissueCount: 2, calculatedAverageAnnualMileage: 4200, averageMileageForAge: 3500,
          mileageAnomalyDetected: true, manufacturerWarrantyMiles: 12000, manufacturerWarrantyMonths: 24,
        },
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
        vdiCheckPricePaidPence: 1499,
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/Recorded as stolen/)).toBeInTheDocument();
    expect(screen.getByText(/Vehicle history report - included with your £14\.99 purchase/)).toBeInTheDocument();
    expect(screen.getByText(/Bought 01\/01\/2026 - free to look up again until 15\/01\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 keeper change\(s\) on record/)).toBeInTheDocument();
    expect(screen.getByText(/1 plate change\(s\) on record/)).toBeInTheDocument();
    expect(screen.getByText(/Average annual mileage: 4,200 mi\/year/)).toBeInTheDocument();
    expect(screen.getByText(/⚠️ anomaly flagged/)).toBeInTheDocument();
    expect(screen.getByText(/Manufacturer warranty: 24 months \/ 12,000 miles from new/)).toBeInTheDocument();
    expect(screen.getByText("Keeper change history")).toBeInTheDocument();
    // Rendered newest-first - the 2024 entry should come before the 2023 one.
    const keeperEntries = screen.getAllByText(/new keeper registered/);
    expect(keeperEntries[0]).toHaveTextContent("01/06/2024");
    expect(keeperEntries[1]).toHaveTextContent("01/01/2023");
    expect(screen.queryByRole("button", { name: /Buy the vehicle history report/ })).not.toBeInTheDocument();
  });

  it("shows 'your free Premium report' when the check was granted free, not purchased", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [], keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
        },
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
        vdiCheckPricePaidPence: 0,
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/Vehicle history report - your free Premium report/)).toBeInTheDocument();
  });

  it("renders the enriched write-off record, registration/manufacture dates, VED rates, and technical spec", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "DU60OAL", make: "Suzuki", model: "SFV650", fuelType: "Petrol", colour: "Red",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: true, writeOffRecordCount: 1, hasOutstandingFinance: false,
          financeRecords: [], keeperChanges: [], keeperChangeCount: 4, plateChangeCount: 0, colourChangeCount: 1,
          currentColour: "RED", v5cReissueCount: 4, calculatedAverageAnnualMileage: 1310, averageMileageForAge: 64000,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
          writeOffRecords: [
            {
              status: "CAT N NON STRUCTURAL DAMAGE",
              category: "N",
              lossDate: "2025-08-11T00:00:00Z",
              insurerName: "4th Dimension Innovation Ltd",
              insurerCode: "560",
            },
          ],
          originalColour: "RED",
          dateFirstRegisteredInUk: "2010-12-11T00:00:00Z",
          dateOfManufacture: "2010-12-11T00:00:00Z",
          vedStandardSixMonths: 68.75,
          vedStandardTwelveMonths: 125,
          massInServiceKg: 202,
          taxationClass: "L3",
          bhp: 71,
          soundLevels: { stationaryDb: 90, driveByDb: 79, engineSpeedRpm: 4200 },
          plateChanges: [{ currentVrm: "DU60OAL", previousVrm: "PN74XSA", dateOfTransaction: "2020-05-15T00:00:00Z" }],
        },
        vdiCheckPurchasedAt: "2026-01-01T00:00:00.000Z",
        vdiCheckExpiresAt: "2026-01-15T00:00:00.000Z",
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "DU60OAL");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/CAT N NON STRUCTURAL DAMAGE by 4th Dimension Innovation Ltd - 560/)).toBeInTheDocument();
    expect(screen.getByText(/Date first registered \(UK\): 11\/12\/2010/)).toBeInTheDocument();
    expect(screen.getByText(/Date of manufacture: 11\/12\/2010/)).toBeInTheDocument();
    expect(screen.getByText(/Colour: red \(1 change on record\)/)).toBeInTheDocument();
    expect(screen.getByText(/Road tax \(standard rate\): £68\.75 for 6 months.*£125 for 12 months/)).toBeInTheDocument();
    expect(screen.getByText(/Mass in service: 202 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Taxation class: L3/)).toBeInTheDocument();
    expect(screen.getByText(/Power: 71 bhp/)).toBeInTheDocument();
    expect(screen.getByText(/Sound levels: stationary 90 dB.*drive-by 79 dB.*at 4,200 rpm/)).toBeInTheDocument();
    expect(screen.getByText("Plate change history")).toBeInTheDocument();
    expect(screen.getByText(/PN74XSA → DU60OAL/)).toBeInTheDocument();
  });

  it("shows the already-used message and a fresh Buy button when a purchase has already been consumed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: null, vdiCheckBlockedReason: "already_used",
        reportTier: "freeNoVehicle", reportPricePence: 1499, reportPriceLabel: "£14.99", proFreeAvailable: false, nextFreeReportAt: null,
      }),
    });
    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/already been used/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buy the vehicle history report/ })).toBeInTheDocument();
  });

  it("on load, a Stripe return with vdiPurchaseId and vrm in the URL auto-fills the plate and runs the paid lookup", async () => {
    window.history.pushState({}, "", "/buying-guide?vdiPurchaseId=purchase123&vrm=AB12CDE&session_id=cs_test_123");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Honda", model: "CB125R", fuelType: "Petrol", colour: "Black",
        plateInRetention: false, motDueDate: null, motTests: [], briefing: null, taxDetails: null,
        vdiCheck: {
          isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false,
          financeRecords: [], keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
          v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null,
          mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
        },
      }),
    });

    render(<BuyingGuideForm signedIn />);

    await waitFor(() => expect(screen.getByLabelText("Search by registration (optional)")).toHaveValue("AB12CDE"));
    expect(await screen.findByText(/1 keeper change\(s\) on record/)).toBeInTheDocument();
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(calledUrl).toContain("vdiPurchaseId=purchase123");
    expect(calledUrl).toContain("session_id=cs_test_123");
    expect(window.location.search).toBe("");
  });
});
