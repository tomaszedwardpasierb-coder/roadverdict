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
import { CarBuyingGuideForm } from "@/components/CarBuyingGuideForm";

describe("CarBuyingGuideForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    window.history.pushState({}, "", "/cars/buying-guide");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

    expect(await screen.findByText(/sign in to search by the car's registration/i)).toBeInTheDocument();
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
    expect(screen.getByText(/1 colour change\(s\) on record \(currently grey\)/)).toBeInTheDocument();
    expect(screen.getByText(/Average annual mileage: 9,800 mi\/year/)).toBeInTheDocument();
    expect(screen.getByText(/⚠️ anomaly flagged/)).toBeInTheDocument();
    expect(screen.getByText(/Manufacturer warranty: 36 months \/ 60,000 miles from new/)).toBeInTheDocument();
    expect(screen.getByText("Keeper change history")).toBeInTheDocument();
    expect(screen.getByText("Private average: £23,994")).toBeInTheDocument();
    expect(screen.getByText("Dealer forecourt: £27,161")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Buy the vehicle history report/ })).not.toBeInTheDocument();
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
