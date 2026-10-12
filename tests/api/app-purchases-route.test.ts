// The app's in-app Pro route: off until RevenueCat is configured, the
// account's own RevenueCat id, and the instant sync after a purchase.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserDoc: vi.fn(),
  enabled: vi.fn(),
  publicKey: vi.fn(),
  remember: vi.fn(),
  sync: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/payments/storePro", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/payments/storePro")>();
  return {
    ...real,
    storePurchasesEnabled: mocks.enabled,
    revenueCatPublicKey: mocks.publicKey,
    revenueCatAppUserId: (email: string) => `rv_${email.length}`,
    rememberAppUserId: mocks.remember,
    syncStorePro: mocks.sync,
  };
});

import { GET, POST } from "@/app/api/app/purchases/route";

const get = (q = "platform=android") => GET(new NextRequest(`https://roadverdict.co.uk/api/app/purchases?${q}`));
const future = new Date(Date.now() + 30 * 86_400_000).toISOString();

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  mocks.getUserDoc.mockResolvedValue({ id: "rider@example.com", pk: "rider@example.com" });
  mocks.enabled.mockReturnValue(true);
  mocks.publicKey.mockReturnValue("goog_test");
});

describe("GET /api/app/purchases", () => {
  it("needs a session", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("is off until RevenueCat is configured, and never hands out an id then", async () => {
    mocks.enabled.mockReturnValue(false);
    const body = await (await get()).json();
    expect(body).toMatchObject({ enabled: false, isPro: false });
    expect(body.appUserId).toBeUndefined();
    expect(mocks.remember).not.toHaveBeenCalled();
  });

  it("gives the platform's key and the account's own id, remembers the id, and lists Pro's features", async () => {
    const body = await (await get()).json();
    expect(body).toMatchObject({ enabled: true, apiKey: "goog_test", appUserId: "rv_17", isPro: false, proSource: null });
    expect(body.features.length).toBeGreaterThan(3);
    expect(mocks.publicKey).toHaveBeenCalledWith("android");
    expect(mocks.remember).toHaveBeenCalledWith(expect.objectContaining({ id: "rider@example.com" }), "rv_17");
  });

  it("says a website subscriber is already Pro, so the app offers no second subscription", async () => {
    mocks.getUserDoc.mockResolvedValue({ id: "rider@example.com", pk: "rider@example.com", plan: { grantedAt: "", expiresAt: future } });
    expect(await (await get()).json()).toMatchObject({ isPro: true, proSource: "web" });
  });
});

describe("POST /api/app/purchases", () => {
  it("syncs the account's own purchase from RevenueCat and reports Pro", async () => {
    mocks.sync.mockResolvedValue({ ok: true, storePro: { expiresAt: future } });
    mocks.getUserDoc.mockResolvedValue({ id: "rider@example.com", pk: "rider@example.com", storePro: { expiresAt: future } });
    const res = await POST();
    expect(await res.json()).toEqual({ isPro: true, proSource: "store" });
    expect(mocks.sync).toHaveBeenCalledWith("rv_17");
  });

  it("is refused while switched off, and reports a RevenueCat outage without granting anything", async () => {
    mocks.enabled.mockReturnValue(false);
    expect((await POST()).status).toBe(503);
    mocks.enabled.mockReturnValue(true);
    mocks.sync.mockResolvedValue({ ok: false, reason: "revenuecat_unavailable" });
    expect((await POST()).status).toBe(502);
  });
});
