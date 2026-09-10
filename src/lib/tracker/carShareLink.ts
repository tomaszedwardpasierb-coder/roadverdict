// Place at: src/lib/tracker/carShareLink.ts
//
// Car equivalent of shareLink.ts - mirrored, not shared, same
// sister-schema convention as every other bike/car pair in this app.
// ShareLinkDuration/SHARE_LINK_DURATION_LABELS are reused directly from
// shareLink.ts (a plain string-literal union and its label map -
// genuinely vehicle-neutral, nothing to duplicate). The history-request
// follow-up mechanism (followUpSentAt/getShareLinksNeedingFollowUp/
// markShareLinkFollowUpSent) is NOT mirrored here - it only makes sense
// once car ownership transfer exists (there's no "request this car's
// history" flow yet for a follow-up email to nudge a buyer toward), so
// it's deferred to that slice of this same build.
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import { deleteCarReceiptRequestsForShareToken } from "@/lib/tracker/carReceiptRequest";
import type { ShareLinkDuration } from "@/lib/tracker/shareLink";
import type { VdiUnlock } from "@/lib/tracker/vdiUnlock";

export interface CarShareLinkDoc {
  id: string;
  pk: string;
  type: "carShareLink";
  email: string;
  carId: string;
  createdAt: string;
  expiresAt?: string;
  recipientEmail?: string;
  askingPrice?: number;
  vdiUnlock?: VdiUnlock;
}

const DURATION_DAYS: Record<ShareLinkDuration, number> = {
  "1week": 7,
  "1month": 30,
  "6months": 182,
};

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function computeExpiresAt(duration: ShareLinkDuration): string {
  const d = new Date();
  d.setDate(d.getDate() + DURATION_DAYS[duration]);
  return d.toISOString();
}

export async function createCarShareLink(
  email: string,
  carId: string,
  duration: ShareLinkDuration,
  recipientEmail: string,
  askingPrice?: number
): Promise<CarShareLinkDoc> {
  const token = generateToken();
  const container = getContainer();
  const doc: CarShareLinkDoc = {
    id: token,
    pk: token,
    type: "carShareLink",
    email,
    carId,
    createdAt: new Date().toISOString(),
    expiresAt: computeExpiresAt(duration),
    recipientEmail: recipientEmail.trim().toLowerCase(),
    askingPrice,
  };
  await container.items.upsert(doc);
  return doc;
}

export async function resolveCarShareToken(token: string): Promise<{ email: string; carId: string; recipientEmail?: string; askingPrice?: number; vdiUnlock?: VdiUnlock } | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<CarShareLinkDoc>();
    if (!resource) return null;
    if (resource.expiresAt && new Date(resource.expiresAt) < new Date()) return null;
    return { email: resource.email, carId: resource.carId, recipientEmail: resource.recipientEmail, askingPrice: resource.askingPrice, vdiUnlock: resource.vdiUnlock };
  } catch {
    return null;
  }
}

export async function getCarShareLinksForUser(email: string): Promise<CarShareLinkDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<CarShareLinkDoc>({
      query: "SELECT * FROM c WHERE c.type = 'carShareLink' AND c.email = @email ORDER BY c.createdAt DESC",
      parameters: [{ name: "@email", value: email }],
    })
    .fetchAll();
  return resources;
}

export async function getCarShareLink(token: string): Promise<CarShareLinkDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<CarShareLinkDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function extendCarShareLink(token: string, duration: ShareLinkDuration): Promise<CarShareLinkDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<CarShareLinkDoc>();
  if (!resource) return null;
  resource.expiresAt = computeExpiresAt(duration);
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarShareLinkAskingPrice(token: string, askingPrice: number | null): Promise<CarShareLinkDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<CarShareLinkDoc>();
  if (!resource) return null;
  if (askingPrice == null) {
    delete resource.askingPrice;
  } else {
    resource.askingPrice = askingPrice;
  }
  await container.items.upsert(resource);
  return resource;
}

export async function updateCarShareLinkVdiUnlock(token: string, patch: Partial<VdiUnlock>): Promise<CarShareLinkDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<CarShareLinkDoc>();
  if (!resource) return null;
  resource.vdiUnlock = { ...resource.vdiUnlock, ...patch } as VdiUnlock;
  await container.items.upsert(resource);
  return resource;
}

export async function deleteCarShareLink(token: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<CarShareLinkDoc>();
  if (resource) {
    await deleteCarReceiptRequestsForShareToken(resource.email, token);
  }
  await container.item(token, token).delete();
}

export async function deleteExpiredCarShareLinks(): Promise<number> {
  const container = getContainer();
  const nowIso = new Date().toISOString();
  const { resources } = await container.items
    .query<{ id: string; email: string }>({
      query: "SELECT c.id, c.email FROM c WHERE c.type = 'carShareLink' AND IS_DEFINED(c.expiresAt) AND c.expiresAt < @now",
      parameters: [{ name: "@now", value: nowIso }],
    })
    .fetchAll();
  for (const r of resources) {
    await deleteCarReceiptRequestsForShareToken(r.email, r.id);
    await container.item(r.id, r.id).delete();
  }
  return resources.length;
}
