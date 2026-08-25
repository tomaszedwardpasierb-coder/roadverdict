// Place at: src/lib/tracker/shareLink.ts
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import { deleteReceiptRequestsForShareToken } from "@/lib/tracker/receiptRequest";

export interface ShareLinkDoc {
  id: string;
  pk: string;
  type: "shareLink";
  email: string;
  bikeId: string;
  createdAt: string;
  // Absent only on links created before expiry existed - those are
  // grandfathered as never-expiring rather than retroactively cut off.
  // Every link created from here on always has one.
  expiresAt?: string;
  // Who this specific link was generated for. Required for every link
  // created from here on - it's both a courtesy (so the owner can see
  // who a link belongs to) and the source of truth for who's asking
  // when a receipt request comes in through it, rather than trusting
  // whatever email an anonymous report viewer types into a form.
  // Optional only because links created before this field existed
  // genuinely don't have it - Cosmos is schemaless, so those older
  // documents have no recipientEmail property at runtime no matter
  // what this type claims.
  recipientEmail?: string;
  // Set once the 4-week history-request follow-up has been processed
  // for this link - in BOTH senses: an email actually sent, or a
  // deliberate skip because the bike was already claimed/requested by
  // then. Both cases mean "don't check this link again," which is the
  // only thing this field is actually used to decide.
  followUpSentAt?: string;
  // The seller's own choice, always optional - a link works exactly
  // the same with or without one. Set at creation or edited any time
  // afterward via updateShareLinkAskingPrice, since an asking price
  // genuinely changes during a sale. Absent (not zero, not null) is
  // "the seller chose not to share one," not "not yet decided."
  askingPrice?: number;
}

export type ShareLinkDuration = "1week" | "1month" | "6months";

export const SHARE_LINK_DURATION_LABELS: Record<ShareLinkDuration, string> = {
  "1week": "1 week",
  "1month": "1 month",
  "6months": "6 months",
};

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

// Always creates a fresh token now, rather than reusing one - a bike can
// have several live links at once (e.g. different durations sent to
// different people), each independently manageable from the Shareable
// Links tab.
export async function createShareLink(
  email: string,
  bikeId: string,
  duration: ShareLinkDuration,
  recipientEmail: string,
  askingPrice?: number
): Promise<ShareLinkDoc> {
  const token = generateToken();
  const container = getContainer();
  const doc: ShareLinkDoc = {
    id: token,
    pk: token,
    type: "shareLink",
    email,
    bikeId,
    createdAt: new Date().toISOString(),
    expiresAt: computeExpiresAt(duration),
    recipientEmail: recipientEmail.trim().toLowerCase(),
    askingPrice,
  };
  await container.items.upsert(doc);
  return doc;
}

// Cheap point-read, not a search - the token itself is both the id and
// the partition key, so resolving it never needs a cross-partition query.
// An expired link resolves as if it doesn't exist at all, even if the
// cleanup cron hasn't physically deleted it yet - expiry is enforced the
// moment it's checked, not just eventually.
export async function resolveShareToken(token: string): Promise<{ email: string; bikeId: string; recipientEmail?: string; askingPrice?: number } | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<ShareLinkDoc>();
    if (!resource) return null;
    if (resource.expiresAt && new Date(resource.expiresAt) < new Date()) return null;
    return { email: resource.email, bikeId: resource.bikeId, recipientEmail: resource.recipientEmail, askingPrice: resource.askingPrice };
  } catch {
    return null;
  }
}

// Cross-partition - same accepted exception as getAllReminders elsewhere
// in this app. Only ever called from the Shareable Links management tab
// (a rare, user-initiated page load) or the daily cleanup cron, never a
// hot path, so the extra query cost is a deliberate trade-off.
export async function getShareLinksForUser(email: string): Promise<ShareLinkDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<ShareLinkDoc>({
      query: "SELECT * FROM c WHERE c.type = 'shareLink' AND c.email = @email ORDER BY c.createdAt DESC",
      parameters: [{ name: "@email", value: email }],
    })
    .fetchAll();
  return resources;
}

export async function getShareLink(token: string): Promise<ShareLinkDoc | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<ShareLinkDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function extendShareLink(token: string, duration: ShareLinkDuration): Promise<ShareLinkDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<ShareLinkDoc>();
  if (!resource) return null;
  resource.expiresAt = computeExpiresAt(duration);
  await container.items.upsert(resource);
  return resource;
}

// null clears a previously-set price, rather than being a separate
// "remove" function - the seller can change their mind either way
// through the same action.
export async function updateShareLinkAskingPrice(token: string, askingPrice: number | null): Promise<ShareLinkDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<ShareLinkDoc>();
  if (!resource) return null;
  if (askingPrice == null) {
    delete resource.askingPrice;
  } else {
    resource.askingPrice = askingPrice;
  }
  await container.items.upsert(resource);
  return resource;
}

// Deletes the link and cascades to every receipt request made through
// it - the link's own `email` field is the owner, which is exactly the
// partition key those requests are stored under. Cascading here, not
// just in the API route, means every current and future caller gets
// the correct behaviour automatically rather than having to remember it.
export async function deleteShareLink(token: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<ShareLinkDoc>();
  if (resource) {
    await deleteReceiptRequestsForShareToken(resource.email, token);
  }
  await container.item(token, token).delete();
}

// Physically removes anything past its expiry - "permanently deleted",
// not just hidden from view. IS_DEFINED is required rather than a plain
// null check, since a legacy link's expiresAt is genuinely absent from
// the document, not present-and-null - those must never match this query.
export async function deleteExpiredShareLinks(): Promise<number> {
  const container = getContainer();
  const nowIso = new Date().toISOString();
  const { resources } = await container.items
    .query<{ id: string; email: string }>({
      query: "SELECT c.id, c.email FROM c WHERE c.type = 'shareLink' AND IS_DEFINED(c.expiresAt) AND c.expiresAt < @now",
      parameters: [{ name: "@now", value: nowIso }],
    })
    .fetchAll();
  for (const r of resources) {
    // Same cascade as a manual delete - an expired link's outstanding
    // receipt requests have nowhere left to be decided from, so they
    // shouldn't survive the link either.
    await deleteReceiptRequestsForShareToken(r.email, r.id);
    await container.item(r.id, r.id).delete();
  }
  return resources.length;
}

// A bigger decision than a 15-minute sign-in link deserves a longer
// window than most things in this app wait for - 4 weeks is roughly
// how long it takes for "did this person actually buy the bike" to
// become knowable, not an arbitrary number.
const FOLLOW_UP_DELAY_DAYS = 28;

// Cross-partition, same accepted exception as deleteExpiredShareLinks
// directly above - only ever called once a day from the follow-up cron,
// never a hot path. IS_DEFINED on recipientEmail excludes the small
// number of legacy links created before that field was required; a
// link with nobody to email obviously can't get a follow-up email.
export async function getShareLinksNeedingFollowUp(): Promise<ShareLinkDoc[]> {
  const container = getContainer();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - FOLLOW_UP_DELAY_DAYS);
  const { resources } = await container.items
    .query<ShareLinkDoc>({
      query:
        "SELECT * FROM c WHERE c.type = 'shareLink' AND IS_DEFINED(c.recipientEmail) AND NOT IS_DEFINED(c.followUpSentAt) AND c.createdAt <= @cutoff",
      parameters: [{ name: "@cutoff", value: cutoff.toISOString() }],
    })
    .fetchAll();
  return resources;
}

export async function markShareLinkFollowUpSent(token: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(token, token).read<ShareLinkDoc>();
  if (!resource) return;
  resource.followUpSentAt = new Date().toISOString();
  await container.items.upsert(resource);
}
