// Place at: tests/api/car-buying-guide-lookup-route.test.ts
// Mirrors buying-guide-lookup-route.test.ts's own coverage - same
// MotHistoryDetails + VehicleTaxDetails free tier and vdiPurchase-gated
// paid VDI check, plus the car-only, free-but-rate-limited valuation
// (fully decoupled from the VDI purchase - see valuationCheckUsage.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  generateCarBuyingGuideBriefing: vi.fn(),
  isPro: vi.fn(),
  getUserDoc: vi.fn(),
  canRunValuationCheck: vi.fn(),
  recordValuationCheckRun: vi.fn(),
  nextValuationCheckAt: vi.fn(),
  getVdiPurchase: vi.fn(),
  markVdiPurchaseConsumed: vi.fn(),
  findRecentConsumedPurchase: vi.fn(),
  selfHealBuyingGuideVdiPurchase: vi.fn(),
  fetchVdiCheckFromVdg: vi.fn(),
  fetchValuationFromVdg: vi.fn(),
  fetchVehicleTaxDetailsFromVdg: vi.fn(),
  computeBuyingGuideReportTier: vi.fn(),
  getCachedBuyingGuideLookup: vi.fn(),
  setCachedBuyingGuideLookup: vi.fn(),
  canRunFreeBuyingGuideLookup: vi.fn(),
  nextFreeBuyingGuideLookupAt: vi.fn(),
  recordBuyingGuideLookupRun: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.mock("@/lib/tracker/carBuyingGuideBriefing", () => ({
  generateCarBuyingGuideBriefing: mocks.generateCarBuyingGuideBriefing,
}));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/valuationCheckUsage", () => ({
  canRunValuationCheck: mocks.canRunValuationCheck,
  recordValuationCheckRun: mocks.recordValuationCheckRun,
  nextValuationCheckAt: mocks.nextValuationCheckAt,
}));
vi.mock("@/lib/tracker/vdiPurchase", () => ({
  getVdiPurchase: mocks.getVdiPurchase,
  markVdiPurchaseConsumed: mocks.markVdiPurchaseConsumed,
  findRecentConsumedPurchase: mocks.findRecentConsumedPurchase,
  VDI_PURCHASE_RETRIEVAL_WINDOW_MS: 42 * 24 * 60 * 60 * 1000,
}));
vi.mock("@/lib/payments/buyingGuideVdiCheckout", () => ({
  selfHealBuyingGuideVdiPurchase: mocks.selfHealBuyingGuideVdiPurchase,
}));
vi.mock("@/lib/tracker/vdiCheckFetch", () => ({ fetchVdiCheckFromVdg: mocks.fetchVdiCheckFromVdg }));
vi.mock("@/lib/tracker/valuationFetch", () => ({ fetchValuationFromVdg: mocks.fetchValuationFromVdg }));
vi.mock("@/lib/tracker/vehicleTaxFetch", () => ({ fetchVehicleTaxDetailsFromVdg: mocks.fetchVehicleTaxDetailsFromVdg }));
vi.mock("@/lib/payments/buyingGuideReportTier", () => ({ computeBuyingGuideReportTier: mocks.computeBuyingGuideReportTier }));
vi.mock("@/lib/tracker/buyingGuideLookupCache", () => ({
  getCachedBuyingGuideLookup: mocks.getCachedBuyingGuideLookup,
  setCachedBuyingGuideLookup: mocks.setCachedBuyingGuideLookup,
}));
vi.mock("@/lib/tracker/buyingGuideLookupUsage", () => ({
  canRunFreeBuyingGuideLookup: mocks.canRunFreeBuyingGuideLookup,
  nextFreeBuyingGuideLookupAt: mocks.nextFreeBuyingGuideLookupAt,
  recordBuyingGuideLookupRun: mocks.recordBuyingGuideLookupRun,
}));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/cars/buying-guide-lookup/route";

function request(vrm?: string, extra?: Record<string, string>): NextRequest {
  const params = new URLSearchParams();
  if (vrm) params.set("vrm", vrm);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const qs = params.toString();
  const url = `http://localhost/api/cars/buying-guide-lookup${qs ? `?${qs}` : ""}`;
  return new NextRequest(url, { method: "GET" });
}

function vdgMotSuccess(overrides: { statusCode?: number; tests?: object[] } = {}) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        ResponseInformation: { StatusCode: overrides.statusCode ?? 0, IsSuccessStatusCode: true },
        Results: {
          MotHistoryDetails: {
            Make: "Ford",
            Model: "Focus",
            FuelType: "PETROL",
            Colour: "BLUE",
            MotDueDate: "2026-05-01",
            MotTestDetailsList: overrides.tests ?? [],
          },
        },
      }),
  };
}

function vdgMotNotFound() {
  return {
    ok: true,
    json: () => Promise.resolve({ ResponseInformation: { StatusCode: 0, IsSuccessStatusCode: false }, Results: {} }),
  };
}

const parsedMotResult = {
  motDueDate: "2026-05-01",
  tests: [{ testDate: "2025-01-01", passed: true, mileage: 12000, mileageTrusted: true, notes: "" }],
};

function basePurchase(overrides: Partial<{ email: string; vrm: string; vehicleKind: string; status: string }> = {}) {
  return {
    id: "purchase123",
    pk: "purchase123",
    type: "vdiPurchase",
    email: overrides.email ?? "buyer@example.com",
    vrm: overrides.vrm ?? "AB20FOC",
    vehicleKind: overrides.vehicleKind ?? "car",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: overrides.status ?? "paid",
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
  mocks.parseMotHistory.mockReturnValue(parsedMotResult);
  mocks.generateCarBuyingGuideBriefing.mockResolvedValue(null);
  mocks.isPro.mockResolvedValue(false);
  mocks.getUserDoc.mockResolvedValue(null);
  mocks.canRunValuationCheck.mockReturnValue(true);
  mocks.nextValuationCheckAt.mockReturnValue(null);
  mocks.findRecentConsumedPurchase.mockResolvedValue(null);
  mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({
    make: "Ford", taxStatus: "Taxed", taxIsCurrentlyValid: true, taxDueDate: "2027-06-01", taxDaysRemaining: 263, motStatus: "Valid", vedStandardTwelveMonths: 27,
  });
  mocks.fetchVdiCheckFromVdg.mockResolvedValue({
    isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
    keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
    vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null, v5cReissueCount: 0,
    calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
    manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
  });
  mocks.fetchValuationFromVdg.mockResolvedValue({
    valuationTime: null, valuationMileage: null, vehicleDescription: null, onTheRoad: null,
    dealerForecourt: null, tradeRetail: null, privateClean: null, privateAverage: 23994,
    partExchange: null, auction: null, tradeAverage: null, tradePoor: null,
  });
  mocks.computeBuyingGuideReportTier.mockResolvedValue({
    tier: "freeNoVehicle",
    pricePence: 1499,
    proFreeAvailable: false,
    nextFreeAt: null,
  });
  mocks.getCachedBuyingGuideLookup.mockResolvedValue(null);
  mocks.canRunFreeBuyingGuideLookup.mockReturnValue(true);
  mocks.nextFreeBuyingGuideLookupAt.mockReturnValue(null);
  mocks.setCachedBuyingGuideLookup.mockResolvedValue(undefined);
  mocks.recordBuyingGuideLookupRun.mockResolvedValue(undefined);
  process.env.VDG_API_KEY = "test-key";
  delete process.env.GEMINI_API_KEY;
  mocks.fetch.mockResolvedValue(vdgMotSuccess());
});

describe("GET /api/cars/buying-guide-lookup", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when no vrm query param is provided", async () => {
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it("returns 503 when VDG_API_KEY is not configured", async () => {
    delete process.env.VDG_API_KEY;
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(503);
  });

  it("returns 502 when the VDG fetch throws entirely", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG finds no vehicle for the registration", async () => {
    mocks.fetch.mockResolvedValue(vdgMotNotFound());
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(404);
  });

  it("returns identity straight from MotHistoryDetails, no VehicleDetails call at all", async () => {
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ vrm: "AB20FOC", make: "Ford", model: "Focus", fuelType: "PETROL", colour: "BLUE" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("packageName=MotHistoryDetails");
    expect(url).not.toContain("packageName=VehicleDetails");
  });

  it("sets plateInRetention true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockResolvedValue(vdgMotSuccess({ statusCode: 21 }));
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("includes MOT tests (newest first) when MOT history is available", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.motTests).toHaveLength(1);
    expect(body.motTests[0].testDate).toBe("2025-01-01");
    expect(body.motDueDate).toBe("2026-05-01");
  });

  it("does not call generateCarBuyingGuideBriefing when GEMINI_API_KEY is absent", async () => {
    await GET(request("AB20FOC"));
    expect(mocks.generateCarBuyingGuideBriefing).not.toHaveBeenCalled();
  });

  it("calls generateCarBuyingGuideBriefing when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateCarBuyingGuideBriefing.mockResolvedValue({ summary: "Looks good." });
    await GET(request("AB20FOC"));
    expect(mocks.generateCarBuyingGuideBriefing).toHaveBeenCalledOnce();
  });

  it("includes the briefing in the response when Gemini returns one", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const briefing = { summary: "Good history, no red flags." };
    mocks.generateCarBuyingGuideBriefing.mockResolvedValue(briefing);
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.briefing).toEqual(briefing);
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    await GET(request("ab20 foc"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("AB20FOC"));
  });

  // ── Free tax status (always attempted) ──────────────────────────────

  it("always attempts the tax lookup", async () => {
    await GET(request("AB20FOC"));
    expect(mocks.fetchVehicleTaxDetailsFromVdg).toHaveBeenCalledWith("AB20FOC", "test-key");
  });

  it("includes the real tax details in the response", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.taxDetails).toMatchObject({ taxStatus: "Taxed", taxIsCurrentlyValid: true });
  });

  // ── Standalone, pay-per-use VDI check ─────────────────────────────────

  it("does not run a VDI check when no vdiPurchaseId is supplied and no recent purchase exists for this plate", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.findRecentConsumedPurchase).toHaveBeenCalledWith("buyer@example.com", "AB20FOC", "car");
    expect(mocks.getVdiPurchase).not.toHaveBeenCalled();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toBeNull();
    expect(body.vdiCheckBlockedReason).toBeUndefined();
    expect(body.vdiCheckPurchasedAt).toBeNull();
    expect(body.vdiCheckExpiresAt).toBeNull();
  });

  it("returns a cached VDI check for free when a recent purchase for this exact plate already exists, without a vdiPurchaseId", async () => {
    mocks.findRecentConsumedPurchase.mockResolvedValue({
      id: "old-purchase", consumedAt: "2026-01-01T00:00:00.000Z",
      vdiCheck: { isStolen: true, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [], keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: null, vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null, v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null },
    });
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toMatchObject({ isStolen: true });
    expect(body.vdiCheckPurchasedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(new Date(body.vdiCheckExpiresAt).getTime() - new Date(body.vdiCheckPurchasedAt).getTime()).toBe(42 * 24 * 60 * 60 * 1000);
  });

  it("runs the VDI check, caches it on the purchase doc, and consumes the purchase when it's already paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).toHaveBeenCalledWith("AB20FOC", "test-key");
    expect(mocks.markVdiPurchaseConsumed).toHaveBeenCalledWith("purchase123", expect.objectContaining({ isStolen: false }));
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
    expect(body.vdiCheckPurchasedAt).not.toBeNull();
    expect(body.vdiCheckExpiresAt).not.toBeNull();
  });

  it("returns fetch_failed without burning the purchase when the VDG fetch itself comes back empty", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    mocks.fetchVdiCheckFromVdg.mockResolvedValue(null);
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.markVdiPurchaseConsumed).not.toHaveBeenCalled();
    expect(body.vdiCheck).toBeNull();
    expect(body.vdiCheckBlockedReason).toBe("fetch_failed");
  });

  it("re-shows the cached vdiCheck (not an already_used error) when reloading the return URL of an already-consumed purchase", async () => {
    mocks.getVdiPurchase.mockResolvedValue({
      ...basePurchase({ status: "consumed" }),
      consumedAt: "2026-01-01T00:00:00.000Z",
      vdiCheck: { isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [], keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: null, vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null, v5cReissueCount: 0, calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false, manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null },
    });
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
    expect(body.vdiCheckBlockedReason).toBeUndefined();
    expect(body.vdiCheckPurchasedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("self-heals a pending purchase using session_id, then runs the check once it comes back paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    mocks.selfHealBuyingGuideVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123", session_id: "cs_test_123" }));
    const body = await response.json();
    expect(mocks.selfHealBuyingGuideVdiPurchase).toHaveBeenCalledWith("purchase123", "cs_test_123");
    expect(mocks.fetchVdiCheckFromVdg).toHaveBeenCalled();
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
  });

  it("blocks with payment_not_confirmed when pending and self-heal doesn't come back paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    mocks.selfHealBuyingGuideVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123", session_id: "cs_test_123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("payment_not_confirmed");
  });

  it("blocks with already_used when the purchase has already been consumed", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "consumed" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("already_used");
  });

  it("blocks with invalid when the purchase was made for the bike route, not this car one", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ vehicleKind: "bike" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("invalid");
  });

  it("passes the vdiCheck result through to the briefing generator when present", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const callArg = mocks.generateCarBuyingGuideBriefing.mock.calls[0][0];
    expect(callArg.vdiCheck).toMatchObject({ isStolen: false });
  });

  // ── Free, rate-limited valuation (decoupled from the VDI purchase) ────

  it("runs the valuation for a free account off cooldown, and records the run", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.fetchValuationFromVdg).toHaveBeenCalledWith("AB20FOC", "test-key");
    expect(mocks.recordValuationCheckRun).toHaveBeenCalledWith("buyer@example.com");
    expect(body.valuation).toMatchObject({ privateAverage: 23994 });
  });

  it("passes isPro through to canRunValuationCheck/nextValuationCheckAt", async () => {
    mocks.isPro.mockResolvedValue(true);
    await GET(request("AB20FOC"));
    expect(mocks.canRunValuationCheck).toHaveBeenCalledWith(null, true);
  });

  it("blocks the valuation on cooldown, returning the reason and next-available date instead", async () => {
    mocks.canRunValuationCheck.mockReturnValue(false);
    mocks.nextValuationCheckAt.mockReturnValue("2026-02-01T00:00:00.000Z");
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.fetchValuationFromVdg).not.toHaveBeenCalled();
    expect(body.valuation).toBeNull();
    expect(body.valuationBlockedReason).toBe("cooldown");
    expect(body.valuationAvailableAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("still attempts the valuation even when no VDI purchase was made - fully decoupled", async () => {
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.vdiCheck).toBeNull();
    expect(body.valuation).toMatchObject({ privateAverage: 23994 });
  });

  it("passes valuation through to the briefing generator when present", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    await GET(request("AB20FOC"));
    const callArg = mocks.generateCarBuyingGuideBriefing.mock.calls[0][0];
    expect(callArg.valuation).toMatchObject({ privateAverage: 23994 });
  });

  // ── Account-aware report pricing ─────────────────────────────────────

  it("includes the computed report tier/price in the response", async () => {
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "freeWithVehicle",
      pricePence: 1299,
      proFreeAvailable: false,
      nextFreeAt: null,
    });
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.computeBuyingGuideReportTier).toHaveBeenCalledWith("buyer@example.com");
    expect(body).toMatchObject({
      reportTier: "freeWithVehicle",
      reportPricePence: 1299,
      reportPriceLabel: "£12.99",
      proFreeAvailable: false,
      nextFreeReportAt: null,
    });
  });

  it("reports proFreeAvailable and nextFreeReportAt for a Pro account", async () => {
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "pro",
      pricePence: 999,
      proFreeAvailable: false,
      nextFreeAt: "2026-02-01T00:00:00.000Z",
    });
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.reportTier).toBe("pro");
    expect(body.reportPriceLabel).toBe("£9.99");
    expect(body.nextFreeReportAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("reports vdiCheckPricePaidPence 0 for a consumed free-Pro-allowance purchase", async () => {
    mocks.getVdiPurchase.mockResolvedValue({ ...basePurchase({ status: "paid" }), pricePence: 0 });
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(body.vdiCheckPricePaidPence).toBe(0);
  });

  // ── Free-lookup global cache and per-account quota gating ────────────

  const cachedLookupData = {
    make: "Toyota",
    model: "Corolla",
    fuelType: "PETROL",
    colour: "SILVER",
    plateInRetention: false,
    motDueDate: "2026-07-01",
    motTestsOldestFirst: [{ testDate: "2025-02-01", passed: true, mileage: 8000, mileageTrusted: true, notes: "" }],
    taxDetails: { taxStatus: "Taxed", taxIsCurrentlyValid: true, taxDueDate: null, taxDaysRemaining: null, motStatus: "Valid", vedStandardTwelveMonths: 190 },
  };

  it("a cache hit skips the VDG fetch entirely and serves the cached facts straight from the cache", async () => {
    mocks.getCachedBuyingGuideLookup.mockResolvedValue(cachedLookupData);
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.getCachedBuyingGuideLookup).toHaveBeenCalledWith("car", "AB20FOC");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(body.make).toBe("Toyota");
    expect(body.model).toBe("Corolla");
    expect(body.motTests).toHaveLength(1);
    expect(body.motTests[0].testDate).toBe("2025-02-01");
    expect(body.motDueDate).toBe("2026-07-01");
    expect(body.taxDetails).toMatchObject({ taxStatus: "Taxed", taxIsCurrentlyValid: true });
    expect(mocks.recordBuyingGuideLookupRun).not.toHaveBeenCalled();
    expect(mocks.setCachedBuyingGuideLookup).not.toHaveBeenCalled();
  });

  it("blocks with requiresPayment when nothing is cached, there's no paid access, and the free quota is used up - no VDG spend at all", async () => {
    mocks.canRunFreeBuyingGuideLookup.mockReturnValue(false);
    mocks.nextFreeBuyingGuideLookupAt.mockReturnValue("2026-03-01T00:00:00.000Z");
    const response = await GET(request("AB20FOC"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.requiresPayment).toBe(true);
    expect(body.nextFreeLookupAt).toBe("2026-03-01T00:00:00.000Z");
    expect(body.make).toBe("");
    expect(body.model).toBe("");
    expect(body.fuelType).toBe("");
    expect(body.colour).toBe("");
    expect(body.motDueDate).toBeNull();
    expect(body.motTests).toEqual([]);
    expect(body.briefing).toBeNull();
    expect(body.vdiCheck).toBeNull();
    expect(body.valuation).toBeNull();
    expect(body.taxDetails).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("still returns a correct, priced reportTier/reportPricePence in the blocked requiresPayment response", async () => {
    mocks.canRunFreeBuyingGuideLookup.mockReturnValue(false);
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "freeWithVehicle",
      pricePence: 1299,
      proFreeAvailable: false,
      nextFreeAt: null,
    });
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(body.requiresPayment).toBe(true);
    expect(body.reportTier).toBe("freeWithVehicle");
    expect(body.reportPricePence).toBe(1299);
    expect(body.reportPriceLabel).toBe("£12.99");
    expect(body.proFreeAvailable).toBe(false);
    expect(body.nextFreeReportAt).toBeNull();
  });

  it("a valid paid VDI purchase bypasses the exhausted free quota - the lookup proceeds normally", async () => {
    mocks.canRunFreeBuyingGuideLookup.mockReturnValue(false);
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.canRunFreeBuyingGuideLookup).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalled();
    expect(body.requiresPayment).toBe(false);
    expect(body.make).toBe("Ford");
    expect(body.model).toBe("Focus");
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
  });

  it("reuses a cached free-tier briefing without a Gemini call when there's no paid access", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const cachedBriefing = { motFlags: [], modelNotes: [], summary: "Cached, no VDI facts." };
    mocks.getCachedBuyingGuideLookup.mockResolvedValue({ ...cachedLookupData, briefing: cachedBriefing });
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.generateCarBuyingGuideBriefing).not.toHaveBeenCalled();
    expect(body.briefing).toEqual(cachedBriefing);
    expect(mocks.setCachedBuyingGuideLookup).not.toHaveBeenCalled();
  });

  it("regenerates a fresh, VDI-aware briefing instead of the cached one when this request has paid access", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const cachedBriefing = { motFlags: [], modelNotes: [], summary: "Cached, no VDI facts." };
    const freshBriefing = { motFlags: [], modelNotes: [], summary: "Fresh, with VDI facts." };
    mocks.getCachedBuyingGuideLookup.mockResolvedValue({ ...cachedLookupData, briefing: cachedBriefing });
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    mocks.generateCarBuyingGuideBriefing.mockResolvedValue(freshBriefing);
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.generateCarBuyingGuideBriefing).toHaveBeenCalledOnce();
    expect(body.briefing).toEqual(freshBriefing);
    // Never overwrites the cache with a VDI-aware briefing - only ever
    // the safe, VDI-free version belongs in the shared cache.
    expect(mocks.setCachedBuyingGuideLookup).not.toHaveBeenCalled();
  });

  it("backfills a missing free-tier briefing onto an existing cache entry once a free visitor generates one", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const freshBriefing = { motFlags: [], modelNotes: [], summary: "Backfilled." };
    mocks.getCachedBuyingGuideLookup.mockResolvedValue({ ...cachedLookupData, briefing: null });
    mocks.generateCarBuyingGuideBriefing.mockResolvedValue(freshBriefing);
    const response = await GET(request("AB20FOC"));
    const body = await response.json();
    expect(mocks.generateCarBuyingGuideBriefing).toHaveBeenCalledOnce();
    expect(body.briefing).toEqual(freshBriefing);
    expect(mocks.setCachedBuyingGuideLookup).toHaveBeenCalledWith("car", "AB20FOC", { ...cachedLookupData, briefing: freshBriefing });
  });

  it("caches a fresh (non-cached, quota-available) lookup and records the free-quota run", async () => {
    const response = await GET(request("AB20FOC"));
    await response.json();
    expect(mocks.setCachedBuyingGuideLookup).toHaveBeenCalledWith("car", "AB20FOC", {
      make: "Ford",
      model: "Focus",
      fuelType: "PETROL",
      colour: "BLUE",
      plateInRetention: false,
      motDueDate: "2026-05-01",
      motTestsOldestFirst: parsedMotResult.tests,
      taxDetails: {
        make: "Ford",
        taxStatus: "Taxed",
        taxIsCurrentlyValid: true,
        taxDueDate: "2027-06-01",
        taxDaysRemaining: 263,
        motStatus: "Valid",
        vedStandardTwelveMonths: 27,
      },
      briefing: null,
    });
    expect(mocks.recordBuyingGuideLookupRun).toHaveBeenCalledWith("buyer@example.com");
  });

  it("caches a fresh lookup unlocked by paid access too, but does not spend the free quota for it", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    const response = await GET(request("AB20FOC", { vdiPurchaseId: "purchase123" }));
    await response.json();
    expect(mocks.setCachedBuyingGuideLookup).toHaveBeenCalledWith("car", "AB20FOC", expect.objectContaining({ make: "Ford", model: "Focus" }));
    expect(mocks.recordBuyingGuideLookupRun).not.toHaveBeenCalled();
  });
});
