// The app's history check route: Pro's free report or a store purchase
// becomes a paid check on one plate - and it never goes to Stripe.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  tier: vi.fn(),
  grantFree: vi.fn(),
  claim: vi.fn(),
  unused: vi.fn(),
  enabled: vi.fn(),
  openTo: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/payments/buyingGuideReportTier", () => ({ computeBuyingGuideReportTier: mocks.tier }));
vi.mock("@/lib/payments/buyingGuideVdiCheckout", () => ({ grantFreeProHistoryCheck: mocks.grantFree }));
vi.mock("@/lib/payments/storeHistoryCheck", () => ({ claimStoreHistoryCheck: mocks.claim, unusedStoreHistoryChecks: mocks.unused }));
vi.mock("@/lib/payments/storePro", () => ({ storePurchasesEnabled: mocks.enabled, storeBuyingOpenTo: mocks.openTo }));

import { GET, POST } from "@/app/api/app/history-check/route";

const post = (body: unknown) =>
  POST(new NextRequest("https://roadverdict.co.uk/api/app/history-check", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.enabled.mockReturnValue(true);
  mocks.openTo.mockReturnValue(true);
});

describe("GET /api/app/history-check", () => {
  it("needs a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("counts the account's unused store purchases", async () => {
    mocks.unused.mockResolvedValue(1);
    expect(await (await GET()).json()).toEqual({ unusedPaidChecks: 1 });
    expect(mocks.unused).toHaveBeenCalledWith("rider@example.com");
  });

  it("says none, without asking RevenueCat, while buying isn't open to this account", async () => {
    mocks.openTo.mockReturnValue(false);
    expect(await (await GET()).json()).toEqual({ unusedPaidChecks: 0 });
    expect(mocks.unused).not.toHaveBeenCalled();
  });
});

describe("POST /api/app/history-check", () => {
  it("needs a session and a plate, bike or car, and free or store", async () => {
    expect((await post({ vrm: "AB12CDE", kind: "van", use: "store" })).status).toBe(400);
    expect((await post({ vrm: "", kind: "bike", use: "store" })).status).toBe(400);
    expect((await post({ vrm: "AB12CDE", kind: "bike", use: "stripe" })).status).toBe(400);
    mocks.getSession.mockResolvedValue(null);
    expect((await post({ vrm: "AB12CDE", kind: "bike", use: "store" })).status).toBe(401);
  });

  it("uses Pro's free report on the cleaned plate", async () => {
    mocks.tier.mockResolvedValue({ proFreeAvailable: true });
    mocks.grantFree.mockResolvedValue("free123");
    const res = await post({ vrm: " ab12 cde ", kind: "car", use: "free" });
    expect(await res.json()).toEqual({ vdiPurchaseId: "free123" });
    expect(mocks.grantFree).toHaveBeenCalledWith("rider@example.com", "AB12CDE", "car");
  });

  it("refuses the free report to an account that doesn't have one, without granting", async () => {
    mocks.tier.mockResolvedValue({ proFreeAvailable: false });
    expect((await post({ vrm: "AB12CDE", kind: "bike", use: "free" })).status).toBe(409);
    expect(mocks.grantFree).not.toHaveBeenCalled();
  });

  it("turns a store purchase into a check, even for an account the buying switch doesn't cover", async () => {
    mocks.openTo.mockReturnValue(false);
    mocks.claim.mockResolvedValue({ ok: true, purchaseId: "store_abc" });
    expect(await (await post({ vrm: "AB12CDE", kind: "bike", use: "store" })).json()).toEqual({ vdiPurchaseId: "store_abc" });
    expect(mocks.claim).toHaveBeenCalledWith("rider@example.com", "AB12CDE", "bike");
  });

  it("says when there's no unused purchase, or RevenueCat can't be read", async () => {
    mocks.claim.mockResolvedValue({ ok: false, reason: "none" });
    expect((await post({ vrm: "AB12CDE", kind: "bike", use: "store" })).status).toBe(404);
    mocks.claim.mockResolvedValue({ ok: false, reason: "revenuecat_unavailable" });
    expect((await post({ vrm: "AB12CDE", kind: "bike", use: "store" })).status).toBe(502);
  });

  it("is refused while store buying is switched off", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await post({ vrm: "AB12CDE", kind: "bike", use: "store" })).status).toBe(503);
    expect(mocks.claim).not.toHaveBeenCalled();
  });
});
