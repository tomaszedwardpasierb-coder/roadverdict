// RevenueCat's webhook: only with the shared secret, only our own ids, and a
// retry asked for only when RevenueCat itself couldn't be read.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ syncStorePro: vi.fn(), enabled: vi.fn() }));
vi.mock("@/lib/payments/storePro", () => ({ syncStorePro: mocks.syncStorePro, storePurchasesEnabled: mocks.enabled }));

import { POST } from "@/app/api/revenuecat/webhook/route";

function post(body: unknown, auth = "Bearer hook-secret") {
  return POST(new NextRequest("https://roadverdict.co.uk/api/revenuecat/webhook", { method: "POST", headers: { authorization: auth }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.enabled.mockReturnValue(true);
  mocks.syncStorePro.mockResolvedValue({ ok: true, storePro: null });
  process.env.REVENUECAT_WEBHOOK_AUTH = "hook-secret";
});
afterEach(() => delete process.env.REVENUECAT_WEBHOOK_AUTH);

describe("POST /api/revenuecat/webhook", () => {
  it("refuses a missing or wrong secret, and does nothing while switched off", async () => {
    expect((await post({ event: { app_user_id: "rv_a" } }, "Bearer wrong")).status).toBe(401);
    expect((await post({ event: { app_user_id: "rv_a" } }, "")).status).toBe(401);
    mocks.enabled.mockReturnValue(false);
    expect((await post({ event: { app_user_id: "rv_a" } })).status).toBe(503);
    expect(mocks.syncStorePro).not.toHaveBeenCalled();
  });

  it("syncs every account a transfer names, and skips RevenueCat's anonymous ids", async () => {
    const res = await post({ event: { type: "TRANSFER", app_user_id: "$RCAnonymousID:x", transferred_from: ["rv_old"], transferred_to: ["rv_new"] } });
    expect(await res.json()).toEqual({ ok: true, synced: 2 });
    expect(mocks.syncStorePro.mock.calls.map((c) => c[0])).toEqual(["rv_old", "rv_new"]);
  });

  it("asks RevenueCat to retry only when RevenueCat couldn't be read", async () => {
    mocks.syncStorePro.mockResolvedValueOnce({ ok: false, reason: "unknown_user" });
    expect((await post({ event: { app_user_id: "rv_gone" } })).status).toBe(200);
    mocks.syncStorePro.mockResolvedValueOnce({ ok: false, reason: "revenuecat_unavailable" });
    expect((await post({ event: { app_user_id: "rv_a" } })).status).toBe(502);
  });
});
