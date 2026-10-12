// In-app Pro (RevenueCat): which source runs longest, how RevenueCat's
// entitlement becomes storePro, and the sync that copies it onto the account.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), patch: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: () => ({ fetchAll: mocks.query }) },
    item: () => ({ patch: mocks.patch }),
  }),
}));
vi.mock("@/lib/fetchWithTimeout", () => ({ fetchWithTimeout: mocks.fetch }));

import {
  isProActive,
  proExpiry,
  proSource,
  revenueCatAppUserId,
  storeProFromSubscriber,
  storePurchasesEnabled,
  syncStorePro,
} from "@/lib/payments/storePro";

const NOW = new Date("2026-10-11T12:00:00Z").getTime();
const future = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.REVENUECAT_SECRET_KEY = "sk_test";
  process.env.REVENUECAT_WEBHOOK_AUTH = "hook-secret";
  process.env.REVENUECAT_APP_USER_SECRET = "user-secret";
  process.env.REVENUECAT_ANDROID_API_KEY = "goog_test";
});
afterEach(() => {
  for (const k of ["REVENUECAT_SECRET_KEY", "REVENUECAT_WEBHOOK_AUTH", "REVENUECAT_APP_USER_SECRET", "REVENUECAT_ANDROID_API_KEY"]) delete process.env[k];
});

describe("which Pro runs longest", () => {
  it("takes the later of the website plan and the store purchase", () => {
    const user = { plan: { grantedAt: "", expiresAt: future(3) }, storePro: { store: "play_store" as const, productId: "pro_annual", expiresAt: future(300), willRenew: true, updatedAt: "" } };
    expect(proExpiry(user)).toBe(future(300));
    expect(isProActive(user, NOW)).toBe(true);
    expect(proSource(user, NOW)).toBe("web");
  });

  it("counts a store purchase alone, and nothing once both have run out", () => {
    const store = { storePro: { store: "play_store" as const, productId: "pro_monthly", expiresAt: future(10), willRenew: true, updatedAt: "" } };
    expect(isProActive(store, NOW)).toBe(true);
    expect(proSource(store, NOW)).toBe("store");
    expect(isProActive({ plan: { expiresAt: future(-1) } }, NOW)).toBe(false);
    expect(isProActive(null, NOW)).toBe(false);
  });
});

describe("the id RevenueCat sees", () => {
  it("is stable per account, never contains the email, and ignores case", () => {
    const a = revenueCatAppUserId("Rider@Example.com");
    expect(a).toMatch(/^rv_[0-9a-f]{32}$/);
    expect(a).toBe(revenueCatAppUserId("rider@example.com"));
    expect(a).not.toContain("rider");
  });

  it("is off until every setting exists", () => {
    expect(storePurchasesEnabled()).toBe(true);
    delete process.env.REVENUECAT_WEBHOOK_AUTH;
    expect(storePurchasesEnabled()).toBe(false);
  });
});

describe("storeProFromSubscriber", () => {
  const sub = (expires: string | null, unsubscribed: string | null = null) => ({
    subscriber: {
      entitlements: { pro: { expires_date: expires, product_identifier: "pro_monthly" } },
      subscriptions: { pro_monthly: { store: "play_store", unsubscribe_detected_at: unsubscribed } },
    },
  });

  it("reads a running entitlement, and whether it will renew", () => {
    expect(storeProFromSubscriber(sub(future(20)), NOW)).toMatchObject({ store: "play_store", productId: "pro_monthly", expiresAt: future(20), willRenew: true });
    expect(storeProFromSubscriber(sub(future(20), future(-1)), NOW)?.willRenew).toBe(false);
  });

  it("gives nothing for an expired or missing entitlement", () => {
    expect(storeProFromSubscriber(sub(future(-1)), NOW)).toBeNull();
    expect(storeProFromSubscriber({ subscriber: { entitlements: {} } }, NOW)).toBeNull();
  });
});

describe("syncStorePro", () => {
  const user = { id: "rider@example.com", pk: "rider@example.com", revenuecatAppUserId: "rv_abc" };

  it("copies a running entitlement onto the account", async () => {
    mocks.query.mockResolvedValue({ resources: [user] });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ subscriber: { entitlements: { pro: { expires_date: future(30), product_identifier: "pro_annual" } }, subscriptions: { pro_annual: { store: "play_store" } } } }) });
    const result = await syncStorePro("rv_abc", NOW);
    expect(result).toMatchObject({ ok: true, storePro: { productId: "pro_annual" } });
    expect(mocks.patch).toHaveBeenCalledWith([expect.objectContaining({ op: "set", path: "/storePro" })]);
    expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer sk_test");
  });

  it("removes store Pro once RevenueCat says it has ended (a cancellation run out, or a refund)", async () => {
    mocks.query.mockResolvedValue({ resources: [{ ...user, storePro: { expiresAt: future(5) } }] });
    mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ subscriber: { entitlements: {} } }) });
    await syncStorePro("rv_abc", NOW);
    expect(mocks.patch).toHaveBeenCalledWith([{ op: "remove", path: "/storePro" }]);
  });

  it("changes nothing when the account is unknown or RevenueCat can't be read", async () => {
    mocks.query.mockResolvedValue({ resources: [] });
    expect(await syncStorePro("rv_nobody", NOW)).toEqual({ ok: false, reason: "unknown_user" });
    mocks.query.mockResolvedValue({ resources: [user] });
    mocks.fetch.mockResolvedValue({ ok: false });
    expect(await syncStorePro("rv_abc", NOW)).toEqual({ ok: false, reason: "revenuecat_unavailable" });
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
