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
// plate than the one actually paid for.
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";

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

export async function markVdiPurchaseConsumed(id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, id).read<VdiPurchaseDoc>();
  if (!resource) return;
  resource.status = "consumed";
  resource.consumedAt = new Date().toISOString();
  await container.items.upsert(resource);
}
