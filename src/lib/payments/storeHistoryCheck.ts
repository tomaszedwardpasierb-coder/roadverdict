// Place at: src/lib/payments/storeHistoryCheck.ts
//
// The full history check bought inside the app (Google Play now, the App
// Store later), through RevenueCat. Each store purchase of the one-off
// product is worth exactly one report, on the plate the buyer picks.
//
// RevenueCat is the record of what was paid: its subscriber record lists
// every one-off purchase. A purchase becomes one vdiPurchase doc
// (vdiPurchase.ts), created already "paid", whose id is derived from the
// store purchase - so creating the doc IS the claim: Cosmos refuses a
// second doc with the same id, and two requests can never spend one
// purchase twice. The buying-guide-lookup routes then run the check and
// show it exactly as they do for a Stripe purchase.
//
// A purchase not yet turned into a report stays available: the app asks
// how many are unused and offers "use my paid check" instead of selling
// another one - e.g. when the connection dropped straight after paying,
// or the data service failed (the doc is then still "paid", not
// "consumed", and moves to whichever plate is checked next).
import { createHash } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { APP_HISTORY_CHECK_PRICE_PENCE } from "@/lib/payments/pricing";
import { fetchSubscriber, revenueCatAppUserId, type RcSubscriber } from "@/lib/payments/storePro";
import type { VdiPurchaseDoc } from "@/lib/tracker/vdiPurchase";
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";

// The product id in Play Console (and later App Store Connect).
export const HISTORY_CHECK_PRODUCT_ID = "full_history_check";

export interface StoreCheckPurchase {
  transactionId: string;
  purchasedAt: string;
}

// Every store purchase of the history check, oldest first. RevenueCat may
// name a Play one-off product with its purchase option ("full_history_check:buy").
export function historyCheckPurchases(data: RcSubscriber | null): StoreCheckPurchase[] {
  const all = data?.subscriber?.non_subscriptions ?? {};
  return Object.entries(all)
    .filter(([product]) => product === HISTORY_CHECK_PRODUCT_ID || product.startsWith(`${HISTORY_CHECK_PRODUCT_ID}:`))
    .flatMap(([, list]) => list.map((p) => ({ transactionId: p.id, purchasedAt: p.purchase_date })))
    .sort((a, b) => a.purchasedAt.localeCompare(b.purchasedAt));
}

// The vdiPurchase doc id for a store purchase - the same purchase always
// maps to the same id.
export function storePurchaseDocId(transactionId: string): string {
  return `store_${createHash("sha256").update(transactionId).digest("hex").slice(0, 40)}`;
}

function isStatus(err: unknown, status: number): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: unknown; statusCode?: unknown };
  return e.code === status || e.statusCode === status;
}

async function readDoc(id: string): Promise<{ doc: VdiPurchaseDoc; etag: string } | null> {
  try {
    const { resource, etag } = await getContainer().item(id, id).read<VdiPurchaseDoc>();
    return resource ? { doc: resource, etag } : null;
  } catch (err) {
    if (isStatus(err, 404)) return null;
    throw err;
  }
}

async function purchasesFor(email: string): Promise<StoreCheckPurchase[] | null> {
  const data = await fetchSubscriber(revenueCatAppUserId(email));
  return data ? historyCheckPurchases(data) : null;
}

// How many paid-for checks this account hasn't received yet. Null when
// RevenueCat can't be read.
export async function unusedStoreHistoryChecks(email: string): Promise<number | null> {
  const purchases = await purchasesFor(email);
  if (!purchases) return null;
  let unused = 0;
  for (const p of purchases) {
    const existing = await readDoc(storePurchaseDocId(p.transactionId));
    if (!existing || existing.doc.status === "paid") unused++;
  }
  return unused;
}

export type ClaimResult = { ok: true; purchaseId: string } | { ok: false; reason: "none" | "revenuecat_unavailable" };

// Turns the oldest unused store purchase into a paid check on this plate.
export async function claimStoreHistoryCheck(email: string, vrm: string, vehicleKind: VehicleKind): Promise<ClaimResult> {
  const purchases = await purchasesFor(email);
  if (!purchases) return { ok: false, reason: "revenuecat_unavailable" };
  const container = getContainer();

  for (const p of purchases) {
    const id = storePurchaseDocId(p.transactionId);
    const existing = await readDoc(id);

    if (!existing) {
      const now = new Date().toISOString();
      const doc: VdiPurchaseDoc = {
        id,
        pk: id,
        type: "vdiPurchase",
        email,
        vrm,
        vehicleKind,
        createdAt: now,
        status: "paid",
        paidAt: now,
        pricePence: APP_HISTORY_CHECK_PRICE_PENCE,
        grantMethod: "store",
        storeTransactionId: p.transactionId,
      };
      try {
        await container.items.create(doc);
        return { ok: true, purchaseId: id };
      } catch (err) {
        // Another request claimed it a moment ago - try the next one.
        if (isStatus(err, 409)) continue;
        throw err;
      }
    }

    const { doc, etag } = existing;
    if (doc.email !== email || doc.status !== "paid") continue;
    if (doc.vrm === vrm && doc.vehicleKind === vehicleKind) return { ok: true, purchaseId: id };
    // Paid for but never delivered on the plate it was first meant for -
    // it moves to this one rather than being lost.
    try {
      await container.item(id, id).replace({ ...doc, vrm, vehicleKind }, { accessCondition: { type: "IfMatch", condition: etag } });
      return { ok: true, purchaseId: id };
    } catch (err) {
      if (isStatus(err, 412)) continue;
      throw err;
    }
  }
  return { ok: false, reason: "none" };
}
