// Place at: src/lib/tracker/receiptRequest.ts
import { getContainer } from "@/lib/cosmos";
import { hashToken, generateToken } from "@/lib/auth/crypto";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export interface ReceiptRequestItem {
  entryId: string;
  category: "service" | "mods" | "bills";
  // Snapshot of what the entry looked like at request time - so the
  // owner's notification email and decision page read sensibly even if
  // the entry's own description is edited afterward.
  description: string;
  status: "pending" | "approved" | "declined";
  // Only meaningful when status is "declined" - either the owner's own
  // words, or a sensible default they never had to type. Buyers see
  // this instead of a bare "declined", which is exactly what makes
  // "ask again anyway" feel reasonable rather than pushy - they know
  // why, not just that.
  reason?: string;
  // Also a snapshot, for the same reason, and for a more important one:
  // the owner needs to actually SEE the receipt to decide whether to
  // share it - a text description alone doesn't show whether it has
  // personal details on it. This is what makes that preview possible
  // without a new fetch back to the live record.
  //
  // Optional, not required - this field was added after receipt
  // requests already existed in production. Cosmos is schemaless, so
  // any request created before that change genuinely has no attachment
  // property at runtime, no matter what an older version of this type
  // claimed. Every caller must handle its absence.
  attachment?: Attachment;
}

export interface ReceiptRequestDoc {
  id: string;
  pk: string; // owner's email - matches every other tracker doc's partitioning
  type: "receiptRequest";
  shareToken: string;
  bikeId: string;
  buyerEmail?: string;
  buyerMessage?: string;
  items: ReceiptRequestItem[];
  // Only the hash is ever stored, same principle as session/magic-link
  // tokens elsewhere in the app - the raw value lives in the emailed
  // decision links and nowhere else.
  decisionTokenHash: string;
  createdAt: string;
  // Rate-limits the buyer's Remind button - without this, nothing stops
  // a reminder being sent every few minutes, which turns a helpful
  // nudge into something that feels like harassment.
  lastReminderSentAt?: string;
  ttl: number;
}

// Requests don't need to outlive the share link they belong to - tied
// to a generous fixed window rather than the link's own (variable,
// sometimes "never") expiry, so a buyer's personal data doesn't linger
// indefinitely just because an owner set their link to never expire.
const REQUEST_TTL_SECONDS = 90 * 24 * 60 * 60;

export async function createReceiptRequest(params: {
  ownerEmail: string;
  shareToken: string;
  bikeId: string;
  buyerEmail?: string;
  buyerMessage?: string;
  items: { entryId: string; category: "service" | "mods" | "bills"; description: string; attachment?: Attachment }[];
}): Promise<{ doc: ReceiptRequestDoc; decisionToken: string }> {
  const container = getContainer();
  const { raw: decisionToken, hash: decisionTokenHash } = generateToken();

  const doc: ReceiptRequestDoc = {
    id: `${params.ownerEmail}::receiptRequest::${Date.now()}`,
    pk: params.ownerEmail,
    type: "receiptRequest",
    shareToken: params.shareToken,
    bikeId: params.bikeId,
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

// Single-partition query - the report page always knows the owner's
// email already (resolved from the share token), so this never needs
// to search across partitions.
export async function getReceiptRequestsForShareToken(ownerEmail: string, shareToken: string): Promise<ReceiptRequestDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<ReceiptRequestDoc>({
      query: "SELECT * FROM c WHERE c.type = 'receiptRequest' AND c.shareToken = @shareToken",
      parameters: [{ name: "@shareToken", value: shareToken }],
    }, { partitionKey: ownerEmail })
    .fetchAll();
  return resources;
}

// Cascade for shareLink deletion - a receipt request only ever makes
// sense in the context of the link a buyer viewed to make it, so once
// that link is gone, any requests tied to it are deleted too rather
// than left as orphaned records nobody can ever act on again.
// Single-partition (the owner's email is already known by every caller
// - either the authenticated session deleting their own link, or the
// cleanup cron reading the link's own `email` field first).
export async function deleteReceiptRequestsForShareToken(ownerEmail: string, shareToken: string): Promise<number> {
  const requests = await getReceiptRequestsForShareToken(ownerEmail, shareToken);
  const container = getContainer();
  for (const r of requests) {
    await container.item(r.id, ownerEmail).delete();
  }
  return requests.length;
}

// One-time backlog cleanup, not an ongoing scheduled job - links
// deleted or expired before the cascade above existed left their
// requests behind with nothing that will ever resolve them again.
// Deliberately doesn't reuse resolveShareToken/getShareLink from
// shareLink.ts (that would be a circular import, since shareLink.ts
// itself calls deleteReceiptRequestsForShareToken above); this does
// the same raw existence check directly against the container instead.
// An orphan here means the link document itself is gone entirely, not
// merely expired - an expired-but-still-present link's requests are
// already handled by deleteExpiredShareLinks' own cascade once that
// cron runs. Cross-partition and rare (an admin-triggered one-off),
// same accepted trade-off as deleteExpiredShareLinks. Safe to re-run -
// once the backlog is clear, it just finds nothing.
export async function purgeOrphanedReceiptRequests(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string; pk: string; shareToken: string }>({
      query: "SELECT c.id, c.pk, c.shareToken FROM c WHERE c.type = 'receiptRequest'",
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

// For the dashboard notification - single-partition (the owner is
// already authenticated, so their own email is always known), filtered
// in code rather than with a Cosmos EXISTS subquery since the realistic
// volume here (a handful of requests, ever) makes that simplicity free.
export async function getPendingReceiptRequestsForOwner(ownerEmail: string): Promise<ReceiptRequestDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<ReceiptRequestDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'receiptRequest'" },
      { partitionKey: ownerEmail }
    )
    .fetchAll();
  return resources.filter((r) => r.items.some((i) => i.status === "pending"));
}

// Cross-partition - a decision link only carries the raw token, not the
// owner's email, so there's nothing to scope the query to. Used rarely
// (once per email click), so the extra query cost is a fine trade for
// not having to also encode the owner's email into the emailed URL.
export async function getReceiptRequestByDecisionToken(rawToken: string): Promise<ReceiptRequestDoc | null> {
  const container = getContainer();
  const hash = hashToken(rawToken);
  const { resources } = await container.items
    .query<ReceiptRequestDoc>({
      query: "SELECT * FROM c WHERE c.type = 'receiptRequest' AND c.decisionTokenHash = @hash",
      parameters: [{ name: "@hash", value: hash }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

export const DEFAULT_DECLINE_REASON = "The seller chose not to share this - it may contain personal details.";

export async function decideReceiptRequestItems(
  requestId: string,
  ownerEmail: string,
  entryIds: string[] | "all",
  decision: "approved" | "declined" | "pending",
  reason?: string
): Promise<ReceiptRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<ReceiptRequestDoc>();
  if (!resource) return null;

  resource.items = resource.items.map((item) => {
    if (entryIds !== "all" && !entryIds.includes(item.entryId)) return item;
    if (decision === "declined") {
      return { ...item, status: decision, reason: reason?.trim() || DEFAULT_DECLINE_REASON };
    }
    // Approving or reverting to pending both clear any previous decline
    // reason - it's only meaningful alongside an active decline.
    const { reason: _drop, ...rest } = item;
    return { ...rest, status: decision };
  });
  await container.items.upsert(resource);
  return resource;
}

const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export function canSendReminder(request: ReceiptRequestDoc): boolean {
  if (!request.lastReminderSentAt) return true;
  return Date.now() - new Date(request.lastReminderSentAt).getTime() > REMINDER_COOLDOWN_MS;
}

export async function recordReminderSent(requestId: string, ownerEmail: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<ReceiptRequestDoc>();
  if (!resource) return;
  resource.lastReminderSentAt = new Date().toISOString();
  await container.items.upsert(resource);
}

// A reminder email needs a working decision link, but only the ORIGINAL
// token's hash was ever stored - the raw value was discarded right
// after hashing, by design. Generating a fresh one and rotating the
// stored hash is the correct fix, not a workaround: if the owner hasn't
// acted yet (which is exactly why a reminder is being sent), the old
// link was never used, so nothing is lost by replacing it.
export async function regenerateDecisionToken(requestId: string, ownerEmail: string): Promise<string | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<ReceiptRequestDoc>();
  if (!resource) return null;
  const { raw, hash } = generateToken();
  resource.decisionTokenHash = hash;
  await container.items.upsert(resource);
  return raw;
}
