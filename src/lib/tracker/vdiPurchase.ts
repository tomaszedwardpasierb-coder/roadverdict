// Place at: src/lib/tracker/vdiPurchase.ts
//
// Backing store for the Buying Guide's standalone, pay-per-use
// Independent Vehicle Check (£9.99, no free tier at all - see
// pricing.ts's BUYING_GUIDE_VDI_CHECK_PRICE_PENCE). Unlike the report
// page's vdiUnlock (a field on a long-lived ShareLinkDoc), a Buying
// Guide lookup isn't tied to any persistent share link, so each purchase
// gets its own one-off, single-partition doc (id = pk), same shape as
// shareLink.ts's own tokens.
//
// Bound to exactly one (email, vrm, vehicleKind) triple at creation time
// and consumed exactly once - this is what stops a paid purchase id
// being replayed to re-run the check for free, or against a different
// plate than the one actually paid for. The fetched VdiCheckResult is
// cached on the doc at consumption time (not re-fetched, and not
// re-billed) so the same purchase can be re-surfaced for free on a later
// lookup of the same plate, within VDI_PURCHASE_RETRIEVAL_WINDOW_MS -
// otherwise the paid data would vanish the moment the browser tab
// closed, which isn't what "you paid £9.99 for this" should mean.
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import type { VehicleKind, VdiCheckResult } from "@/lib/tracker/vdiUnlock";

export const VDI_PURCHASE_RETRIEVAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export interface VdiPurchaseDoc {
  id: string;
  pk: string;
  type: "vdiPurchase";
  email: string;
  vrm: string;
  vehicleKind: VehicleKind;
  createdAt: string;
  status: "pending" | "paid" | "consumed";
  stripeSessionId?: string;
  paidAt?: string;
  consumedAt?: string;
  vdiCheck?: VdiCheckResult;
}

function generatePurchaseId(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export async function createVdiPurchase(email: string, vrm: string, vehicleKind: VehicleKind): Promise<VdiPurchaseDoc> {
  const container = getContainer();
  const id = generatePurchaseId();
  const doc: VdiPurchaseDoc = {
    id,
    pk: id,
    type: "vdiPurchase",
    email,
    vrm,
    vehicleKind,
    createdAt: new Date().toISOString(),
    status: "pending",
  };
  await container.items.upsert(doc);
  return doc;
}

// Cheap point-read, not a search - the purchase id is both the id and
// the partition key, same convention as shareLink.ts's own tokens.
export async function getVdiPurchase(id: string): Promise<VdiPurchaseDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(id, id).read<VdiPurchaseDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

// Idempotent by construction - a Stripe webhook retry, or the
// success-page self-heal having already run first, never regresses an
// already-consumed purchase back to merely "paid".
export async function markVdiPurchasePaid(id: string, stripeSessionId: string): Promise<VdiPurchaseDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(id, id).read<VdiPurchaseDoc>();
  if (!resource) return null;
  if (resource.status === "pending") {
    resource.status = "paid";
    resource.stripeSessionId = stripeSessionId;
    resource.paidAt = new Date().toISOString();
    await container.items.upsert(resource);
  }
  return resource;
}

export async function markVdiPurchaseConsumed(id: string, vdiCheck: VdiCheckResult): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, id).read<VdiPurchaseDoc>();
  if (!resource) return;
  resource.status = "consumed";
  resource.consumedAt = new Date().toISOString();
  resource.vdiCheck = vdiCheck;
  await container.items.upsert(resource);
}

// Cross-partition - same accepted trade-off as getShareLinksForUser
// elsewhere in this app (a purchase's own id is its partition key, not
// the buyer's email, so finding "the most recent paid check for this
// plate" can't be a point-read). Only ever runs on a Buying Guide plate
// lookup, not a hot path shared across the whole app. Lets a buyer look
// up the same plate again within the retrieval window and get their
// already-paid VDI check back for free, rather than needing to keep the
// original purchase's return URL around or pay again.
export async function findRecentConsumedPurchase(email: string, vrm: string, vehicleKind: VehicleKind): Promise<VdiPurchaseDoc | null> {
  const container = getContainer();
  const cutoff = new Date(Date.now() - VDI_PURCHASE_RETRIEVAL_WINDOW_MS).toISOString();
  const { resources } = await container.items
    .query<VdiPurchaseDoc>({
      query:
        "SELECT * FROM c WHERE c.type = 'vdiPurchase' AND c.email = @email AND c.vrm = @vrm AND c.vehicleKind = @vehicleKind AND c.status = 'consumed' AND c.consumedAt >= @cutoff ORDER BY c.consumedAt DESC",
      parameters: [
        { name: "@email", value: email },
        { name: "@vrm", value: vrm },
        { name: "@vehicleKind", value: vehicleKind },
        { name: "@cutoff", value: cutoff },
      ],
    })
    .fetchAll();
  return resources[0] ?? null;
}
