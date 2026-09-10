import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  parseMotHistory: vi.fn(),
  generateBuyingGuideBriefing: vi.fn(),
  getVdiPurchase: vi.fn(),
  markVdiPurchaseConsumed: vi.fn(),
  selfHealBuyingGuideVdiPurchase: vi.fn(),
  fetchVdiCheckFromVdg: vi.fn(),
  fetchVehicleTaxDetailsFromVdg: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/motHistory", () => ({ parseMotHistory: mocks.parseMotHistory }));
vi.mock("@/lib/tracker/buyingGuideBriefing", () => ({
  generateBuyingGuideBriefing: mocks.generateBuyingGuideBriefing,
}));
vi.mock("@/lib/tracker/vdiPurchase", () => ({
  getVdiPurchase: mocks.getVdiPurchase,
  markVdiPurchaseConsumed: mocks.markVdiPurchaseConsumed,
}));
vi.mock("@/lib/payments/buyingGuideVdiCheckout", () => ({
  selfHealBuyingGuideVdiPurchase: mocks.selfHealBuyingGuideVdiPurchase,
}));
vi.mock("@/lib/tracker/vdiCheckFetch", () => ({ fetchVdiCheckFromVdg: mocks.fetchVdiCheckFromVdg }));
vi.mock("@/lib/tracker/vehicleTaxFetch", () => ({ fetchVehicleTaxDetailsFromVdg: mocks.fetchVehicleTaxDetailsFromVdg }));
vi.stubGlobal("fetch", mocks.fetch);

import { GET } from "@/app/api/tracker/buying-guide-lookup/route";

function request(vrm?: string, extra?: Record<string, string>): NextRequest {
  const params = new URLSearchParams();
  if (vrm) params.set("vrm", vrm);
  if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const qs = params.toString();
  const url = `http://localhost/api/tracker/buying-guide-lookup${qs ? `?${qs}` : ""}`;
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
            Make: "Yamaha",
            Model: "MT-07",
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
    email: overrides.email ?? "rider@example.com",
    vrm: overrides.vrm ?? "AB20YAM",
    vehicleKind: overrides.vehicleKind ?? "bike",
    createdAt: "2026-01-01T00:00:00.000Z",
    status: overrides.status ?? "paid",
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.parseMotHistory.mockReturnValue(parsedMotResult);
  mocks.generateBuyingGuideBriefing.mockResolvedValue(null);
  mocks.fetchVehicleTaxDetailsFromVdg.mockResolvedValue({
    make: "Yamaha", taxStatus: "Taxed", taxIsCurrentlyValid: true, taxDueDate: "2027-06-01", taxDaysRemaining: 263, motStatus: "Valid", vedStandardTwelveMonths: 27,
  });
  mocks.fetchVdiCheckFromVdg.mockResolvedValue({
    isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
    keeperChanges: [], keeperChangeCount: 1, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
    vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null, v5cReissueCount: 0,
    calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
    manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
  });
  process.env.VDG_API_KEY = "test-key";
  delete process.env.GEMINI_API_KEY;
  mocks.fetch.mockResolvedValue(vdgMotSuccess());
});

describe("GET /api/tracker/buying-guide-lookup", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(401);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when no vrm query param is provided", async () => {
    const response = await GET(request());
    expect(response.status).toBe(400);
  });

  it("returns 503 when VDG_API_KEY is not configured", async () => {
    delete process.env.VDG_API_KEY;
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(503);
  });

  it("returns 502 when the VDG fetch throws entirely", async () => {
    mocks.fetch.mockRejectedValue(new Error("network timeout"));
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(502);
  });

  it("returns 404 when VDG finds no vehicle for the registration", async () => {
    mocks.fetch.mockResolvedValue(vdgMotNotFound());
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(404);
  });

  it("returns identity straight from MotHistoryDetails, no VehicleDetails call at all", async () => {
    const response = await GET(request("AB20YAM"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ vrm: "AB20YAM", make: "Yamaha", model: "MT-07", fuelType: "PETROL", colour: "BLUE" });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const url = mocks.fetch.mock.calls[0][0] as string;
    expect(url).toContain("packageName=MotHistoryDetails");
    expect(url).not.toContain("packageName=VehicleDetails");
  });

  it("sets plateInRetention true when VDG returns StatusCode 21", async () => {
    mocks.fetch.mockResolvedValue(vdgMotSuccess({ statusCode: 21 }));
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.plateInRetention).toBe(true);
  });

  it("includes MOT tests (newest first) when MOT history is available", async () => {
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.motTests).toHaveLength(1);
    expect(body.motTests[0].testDate).toBe("2025-01-01");
    expect(body.motDueDate).toBe("2026-05-01");
  });

  it("does not call generateBuyingGuideBriefing when GEMINI_API_KEY is absent", async () => {
    await GET(request("AB20YAM"));
    expect(mocks.generateBuyingGuideBriefing).not.toHaveBeenCalled();
  });

  it("calls generateBuyingGuideBriefing when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateBuyingGuideBriefing.mockResolvedValue({ summary: "Looks good." });
    await GET(request("AB20YAM"));
    expect(mocks.generateBuyingGuideBriefing).toHaveBeenCalledOnce();
  });

  it("includes the briefing in the response when Gemini returns one", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    const briefing = { summary: "Good history, no red flags." };
    mocks.generateBuyingGuideBriefing.mockResolvedValue(briefing);
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.briefing).toEqual(briefing);
  });

  it("normalises the VRM to uppercase with spaces stripped before sending to VDG", async () => {
    await GET(request("ab20 yam"));
    expect(mocks.fetch).toHaveBeenCalledWith(expect.stringContaining("AB20YAM"));
  });

  // ── Free tax status (always attempted) ──────────────────────────────

  it("always attempts the tax lookup", async () => {
    await GET(request("AB20YAM"));
    expect(mocks.fetchVehicleTaxDetailsFromVdg).toHaveBeenCalledWith("AB20YAM", "test-key");
  });

  it("includes the real tax details in the response", async () => {
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(body.taxDetails).toMatchObject({ taxStatus: "Taxed", taxIsCurrentlyValid: true });
  });

  // ── Standalone, pay-per-use VDI check ─────────────────────────────────

  it("does not run a VDI check when no vdiPurchaseId is supplied", async () => {
    const response = await GET(request("AB20YAM"));
    const body = await response.json();
    expect(mocks.getVdiPurchase).not.toHaveBeenCalled();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toBeNull();
    expect(body.vdiCheckBlockedReason).toBeUndefined();
  });

  it("runs the VDI check and consumes the purchase when it's already paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).toHaveBeenCalledWith("AB20YAM", "test-key");
    expect(mocks.markVdiPurchaseConsumed).toHaveBeenCalledWith("purchase123");
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
  });

  it("self-heals a pending purchase using session_id, then runs the check once it comes back paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    mocks.selfHealBuyingGuideVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123", session_id: "cs_test_123" }));
    const body = await response.json();
    expect(mocks.selfHealBuyingGuideVdiPurchase).toHaveBeenCalledWith("purchase123", "cs_test_123");
    expect(mocks.fetchVdiCheckFromVdg).toHaveBeenCalled();
    expect(body.vdiCheck).toMatchObject({ isStolen: false });
  });

  it("blocks with payment_not_confirmed when pending and self-heal doesn't come back paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    mocks.selfHealBuyingGuideVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123", session_id: "cs_test_123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheck).toBeNull();
    expect(body.vdiCheckBlockedReason).toBe("payment_not_confirmed");
  });

  it("blocks with payment_not_confirmed when pending and no session_id was given to self-heal against", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "pending" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.selfHealBuyingGuideVdiPurchase).not.toHaveBeenCalled();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("payment_not_confirmed");
  });

  it("blocks with already_used when the purchase has already been consumed", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "consumed" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("already_used");
  });

  it("blocks with invalid when the purchase doesn't exist", async () => {
    mocks.getVdiPurchase.mockResolvedValue(null);
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(body.vdiCheckBlockedReason).toBe("invalid");
  });

  it("blocks with invalid when the purchase belongs to a different account", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ email: "someone-else@example.com" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("invalid");
  });

  it("blocks with invalid when the purchase was made against a different plate", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ vrm: "OTHER123" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("invalid");
  });

  it("blocks with invalid when the purchase was made for the car route, not this bike one", async () => {
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ vehicleKind: "car" }));
    const response = await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const body = await response.json();
    expect(mocks.fetchVdiCheckFromVdg).not.toHaveBeenCalled();
    expect(body.vdiCheckBlockedReason).toBe("invalid");
  });

  it("passes the vdiCheck result through to the briefing generator when present", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.getVdiPurchase.mockResolvedValue(basePurchase({ status: "paid" }));
    await GET(request("AB20YAM", { vdiPurchaseId: "purchase123" }));
    const callArg = mocks.generateBuyingGuideBriefing.mock.calls[0][0];
    expect(callArg.vdiCheck).toMatchObject({ isStolen: false });
  });
});
