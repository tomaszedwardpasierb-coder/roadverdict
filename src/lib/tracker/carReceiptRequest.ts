// Place at: src/lib/tracker/carReceiptRequest.ts
//
// Car equivalent of receiptRequest.ts - mirrored, not shared, same
// sister-schema convention as every other bike/car pair. hashToken/
// generateToken (@/lib/auth/crypto) are reused directly - genuinely
// vehicle-neutral auth-layer crypto, nothing to duplicate.
import { getContainer } from "@/lib/cosmos";
import { hashToken, generateToken } from "@/lib/auth/crypto";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export interface CarReceiptRequestItem {
  entryId: string;
  category: "service" | "mods" | "bills";
  description: string;
  status: "pending" | "approved" | "declined";
  reason?: string;
  attachment?: Attachment;
  decidedAt?: string;
}

export interface CarReceiptRequestDoc {
  id: string;
  pk: string;
  type: "carReceiptRequest";
  shareToken: string;
  carId: string;
  buyerEmail?: string;
  buyerMessage?: string;
  items: CarReceiptRequestItem[];
  decisionTokenHash: string;
  createdAt: string;
  lastReminderSentAt?: string;
  ttl: number;
}

const REQUEST_TTL_SECONDS = 90 * 24 * 60 * 60;

export async function createCarReceiptRequest(params: {
  ownerEmail: string;
  shareToken: string;
  carId: string;
  buyerEmail?: string;
  buyerMessage?: string;
  items: { entryId: string; category: "service" | "mods" | "bills"; description: string; attachment?: Attachment }[];
}): Promise<{ doc: CarReceiptRequestDoc; decisionToken: string }> {
  const container = getContainer();
  const { raw: decisionToken, hash: decisionTokenHash } = generateToken();

  const doc: CarReceiptRequestDoc = {
    id: `${params.ownerEmail}::carReceiptRequest::${Date.now()}`,
    pk: params.ownerEmail,
    type: "carReceiptRequest",
    shareToken: params.shareToken,
    carId: params.carId,
    buyerEmail: params.buyerEmail,
    buyerMessage: params.buyerMessage,
    items: params.items.map((i) => ({ ...i, status: "pending" as const })),
    decisionTokenHash,
    createdAt: new Date().toISOString(),
    ttl: REQUEST_TTL_SECONDS,
  };

  await container.items.upsert(doc);
  return { doc, decisionToken };
}

export async function getCarReceiptRequestsForShareToken(ownerEmail: string, shareToken: string): Promise<CarReceiptRequestDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<CarReceiptRequestDoc>({
      query: "SELECT * FROM c WHERE c.type = 'carReceiptRequest' AND c.shareToken = @shareToken",
      parameters: [{ name: "@shareToken", value: shareToken }],
    }, { partitionKey: ownerEmail })
    .fetchAll();
  return resources;
}

export async function deleteCarReceiptRequestsForShareToken(ownerEmail: string, shareToken: string): Promise<number> {
  const requests = await getCarReceiptRequestsForShareToken(ownerEmail, shareToken);
  const container = getContainer();
  for (const r of requests) {
    await container.item(r.id, ownerEmail).delete();
  }
  return requests.length;
}

// One-time backlog cleanup, not an ongoing scheduled job - same
// reasoning as receiptRequest.ts's own purgeOrphanedReceiptRequests.
// Deliberately doesn't reuse resolveCarShareToken/getCarShareLink from
// carShareLink.ts (that would be a circular import, since
// carShareLink.ts itself calls deleteCarReceiptRequestsForShareToken
// above); this does the same raw existence check directly instead.
export async function purgeOrphanedCarReceiptRequests(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string; pk: string; shareToken: string }>({
      query: "SELECT c.id, c.pk, c.shareToken FROM c WHERE c.type = 'carReceiptRequest'",
    })
    .fetchAll();

  let deletedCount = 0;
  for (const r of resources) {
    let linkExists = true;
    try {
      const { resource } = await container.item(r.shareToken, r.shareToken).read();
      linkExists = !!resource;
    } catch {
      linkExists = false;
    }
    if (!linkExists) {
      await container.item(r.id, r.pk).delete();
      deletedCount++;
    }
  }
  return deletedCount;
}

export interface CarReceiptRequestItemView extends CarReceiptRequestItem {
  priorDecline?: { decidedAt: string; reason?: string };
}

export interface CarReceiptRequestDocView extends Omit<CarReceiptRequestDoc, "items"> {
  items: CarReceiptRequestItemView[];
}

function findPriorDecline(
  allRequests: CarReceiptRequestDoc[],
  currentRequestId: string,
  entryId: string
): { decidedAt: string; reason?: string } | null {
  const declines = allRequests
    .filter((r) => r.id !== currentRequestId)
    .flatMap((r) =>
      r.items
        .filter((i) => i.entryId === entryId && i.status === "declined")
        .map((i) => ({ decidedAt: i.decidedAt ?? r.createdAt, reason: i.reason }))
    )
    .sort((a, b) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime());
  return declines[0] ?? null;
}

export async function getPendingCarReceiptRequestsForOwner(ownerEmail: string): Promise<CarReceiptRequestDocView[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<CarReceiptRequestDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'carReceiptRequest'" },
      { partitionKey: ownerEmail }
    )
    .fetchAll();

  const pending = resources.filter((r) => r.items.some((i) => i.status === "pending"));

  return pending.map((r) => ({
    ...r,
    items: r.items.map((item) => ({
      ...item,
      priorDecline: findPriorDecline(resources, r.id, item.entryId) ?? undefined,
    })),
  }));
}

export async function getCarReceiptRequestByDecisionToken(rawToken: string): Promise<CarReceiptRequestDoc | null> {
  const container = getContainer();
  const hash = hashToken(rawToken);
  const { resources } = await container.items
    .query<CarReceiptRequestDoc>({
      query: "SELECT * FROM c WHERE c.type = 'carReceiptRequest' AND c.decisionTokenHash = @hash",
      parameters: [{ name: "@hash", value: hash }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

export const CAR_DEFAULT_DECLINE_REASON = "The seller chose not to share this - it may contain personal details.";

export async function decideCarReceiptRequestItems(
  requestId: string,
  ownerEmail: string,
  entryIds: string[] | "all",
  decision: "approved" | "declined" | "pending",
  reason?: string
): Promise<CarReceiptRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<CarReceiptRequestDoc>();
  if (!resource) return null;

  const now = new Date().toISOString();
  resource.items = resource.items.map((item) => {
    if (entryIds !== "all" && !entryIds.includes(item.entryId)) return item;
    if (decision === "declined") {
      return { ...item, status: decision, reason: reason?.trim() || CAR_DEFAULT_DECLINE_REASON, decidedAt: now };
    }
    if (decision === "approved") {
      const { reason: _drop, ...rest } = item;
      return { ...rest, status: decision, decidedAt: now };
    }
    const { reason: _drop, decidedAt: _dropDate, ...rest } = item;
    return { ...rest, status: decision };
  });
  await container.items.upsert(resource);
  return resource;
}

const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export function canSendCarReminder(request: CarReceiptRequestDoc): boolean {
  if (!request.lastReminderSentAt) return true;
  return Date.now() - new Date(request.lastReminderSentAt).getTime() > REMINDER_COOLDOWN_MS;
}

export async function recordCarReminderSent(requestId: string, ownerEmail: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<CarReceiptRequestDoc>();
  if (!resource) return;
  resource.lastReminderSentAt = new Date().toISOString();
  await container.items.upsert(resource);
}

export async function regenerateCarDecisionToken(requestId: string, ownerEmail: string): Promise<string | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<CarReceiptRequestDoc>();
  if (!resource) return null;
  const { raw, hash } = generateToken();
  resource.decisionTokenHash = hash;
  await container.items.upsert(resource);
  return raw;
}
