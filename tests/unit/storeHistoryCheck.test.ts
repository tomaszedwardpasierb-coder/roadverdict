// The full history check bought in the app: each store purchase becomes
// exactly one paid check, on the plate the buyer picks, and is never
// spent twice.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown> & { id: string };
const db = vi.hoisted(() => ({ docs: new Map<string, { doc: Doc; etag: number }>(), subscriber: null as unknown, failCreate: null as number | null }));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: {
      create: async (doc: Doc) => {
        if (db.failCreate) throw { code: db.failCreate };
        if (db.docs.has(doc.id)) throw { code: 409 };
        db.docs.set(doc.id, { doc, etag: 1 });
      },
    },
    item: (id: string) => ({
      read: async () => {
        const hit = db.docs.get(id);
        return hit ? { resource: hit.doc, etag: String(hit.etag) } : { resource: undefined, statusCode: 404 };
      },
      replace: async (doc: Doc, opts: { accessCondition: { condition: string } }) => {
        const hit = db.docs.get(id);
        if (!hit || String(hit.etag) !== opts.accessCondition.condition) throw { code: 412 };
        db.docs.set(id, { doc, etag: hit.etag + 1 });
      },
    }),
  }),
}));
vi.mock("@/lib/payments/storePro", () => ({
  fetchSubscriber: async () => db.subscriber,
  revenueCatAppUserId: (email: string) => `rv_${email}`,
}));

import { claimStoreHistoryCheck, historyCheckPurchases, storePurchaseDocId, unusedStoreHistoryChecks } from "@/lib/payments/storeHistoryCheck";

const purchase = (id: string, day: number) => ({ id, purchase_date: `2026-11-0${day}T10:00:00Z`, store: "play_store" });
const withPurchases = (...list: ReturnType<typeof purchase>[]) => ({ subscriber: { non_subscriptions: { full_history_check: list } } });

beforeEach(() => {
  db.docs.clear();
  db.subscriber = null;
  db.failCreate = null;
});

describe("historyCheckPurchases", () => {
  it("lists only the history check, oldest first, under its plain or purchase-option product id", () => {
    const data = {
      subscriber: {
        non_subscriptions: {
          "full_history_check:buy": [purchase("b", 3)],
          full_history_check: [purchase("a", 1)],
          something_else: [purchase("x", 2)],
        },
      },
    };
    expect(historyCheckPurchases(data).map((p) => p.transactionId)).toEqual(["a", "b"]);
    expect(historyCheckPurchases(null)).toEqual([]);
    expect(historyCheckPurchases({ subscriber: {} })).toEqual([]);
  });
});

describe("claimStoreHistoryCheck", () => {
  it("turns a purchase into a paid check on this plate, priced at the store price", async () => {
    db.subscriber = withPurchases(purchase("t1", 1));
    const result = await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "car");
    expect(result).toEqual({ ok: true, purchaseId: storePurchaseDocId("t1") });
    expect(db.docs.get(storePurchaseDocId("t1"))!.doc).toMatchObject({
      type: "vdiPurchase",
      email: "buyer@example.com",
      vrm: "AB12CDE",
      vehicleKind: "car",
      status: "paid",
      grantMethod: "store",
      pricePence: 1299,
      storeTransactionId: "t1",
    });
  });

  it("never spends a delivered purchase again - a second plate needs a second purchase", async () => {
    db.subscriber = withPurchases(purchase("t1", 1));
    await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike");
    db.docs.get(storePurchaseDocId("t1"))!.doc.status = "consumed";
    expect(await claimStoreHistoryCheck("buyer@example.com", "XY34ZZZ", "bike")).toEqual({ ok: false, reason: "none" });

    db.subscriber = withPurchases(purchase("t1", 1), purchase("t2", 2));
    expect(await claimStoreHistoryCheck("buyer@example.com", "XY34ZZZ", "bike")).toEqual({ ok: true, purchaseId: storePurchaseDocId("t2") });
  });

  it("gives the same check back when the same plate asks again before it was delivered", async () => {
    db.subscriber = withPurchases(purchase("t1", 1), purchase("t2", 2));
    const first = await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike");
    const again = await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike");
    expect(again).toEqual(first);
    expect(await unusedStoreHistoryChecks("buyer@example.com")).toBe(2);
  });

  it("moves a paid but never-delivered check to the next plate instead of losing it", async () => {
    db.subscriber = withPurchases(purchase("t1", 1));
    await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike");
    const moved = await claimStoreHistoryCheck("buyer@example.com", "CD56EFG", "car");
    expect(moved).toEqual({ ok: true, purchaseId: storePurchaseDocId("t1") });
    expect(db.docs.get(storePurchaseDocId("t1"))!.doc).toMatchObject({ vrm: "CD56EFG", vehicleKind: "car" });
  });

  it("skips a purchase another request claimed a moment ago", async () => {
    db.subscriber = withPurchases(purchase("t1", 1));
    db.failCreate = 409;
    expect(await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike")).toEqual({ ok: false, reason: "none" });
  });

  it("never touches a check belonging to another account", async () => {
    db.subscriber = withPurchases(purchase("t1", 1));
    db.docs.set(storePurchaseDocId("t1"), { doc: { id: storePurchaseDocId("t1"), email: "other@example.com", status: "paid", vrm: "A1", vehicleKind: "bike" }, etag: 1 });
    expect(await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike")).toEqual({ ok: false, reason: "none" });
  });

  it("says so when RevenueCat can't be read, without creating anything", async () => {
    db.subscriber = null;
    expect(await claimStoreHistoryCheck("buyer@example.com", "AB12CDE", "bike")).toEqual({ ok: false, reason: "revenuecat_unavailable" });
    expect(await unusedStoreHistoryChecks("buyer@example.com")).toBeNull();
    expect(db.docs.size).toBe(0);
  });
});

describe("unusedStoreHistoryChecks", () => {
  it("counts purchases not yet delivered as a report", async () => {
    db.subscriber = withPurchases(purchase("t1", 1), purchase("t2", 2), purchase("t3", 3));
    db.docs.set(storePurchaseDocId("t1"), { doc: { id: storePurchaseDocId("t1"), email: "buyer@example.com", status: "consumed" }, etag: 1 });
    db.docs.set(storePurchaseDocId("t2"), { doc: { id: storePurchaseDocId("t2"), email: "buyer@example.com", status: "paid" }, etag: 1 });
    expect(await unusedStoreHistoryChecks("buyer@example.com")).toBe(2);
  });
});
