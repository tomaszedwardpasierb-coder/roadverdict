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
  // Also a snapshot, for the same reason, and for a more important one:
  // the owner needs to actually SEE the receipt to decide whether to
  // share it - a text description alone doesn't show whether it has
  // personal details on it. This is what makes that preview possible
  // without a new fetch back to the live record.
  attachment: Attachment;
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
  items: { entryId: string; category: "service" | "mods" | "bills"; description: string; attachment: Attachment }[];
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

export async function decideReceiptRequestItems(
  requestId: string,
  ownerEmail: string,
  entryIds: string[] | "all",
  decision: "approved" | "declined"
): Promise<ReceiptRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<ReceiptRequestDoc>();
  if (!resource) return null;

  resource.items = resource.items.map((item) =>
    entryIds === "all" || entryIds.includes(item.entryId) ? { ...item, status: decision } : item
  );
  await container.items.upsert(resource);
  return resource;
}
