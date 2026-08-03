// Place at: src/lib/tracker/shareLink.ts
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";

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
export async function createShareLink(email: string, bikeId: string, duration: ShareLinkDuration): Promise<ShareLinkDoc> {
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
  };
  await container.items.upsert(doc);
  return doc;
}

// Cheap point-read, not a search - the token itself is both the id and
// the partition key, so resolving it never needs a cross-partition query.
// An expired link resolves as if it doesn't exist at all, even if the
// cleanup cron hasn't physically deleted it yet - expiry is enforced the
// moment it's checked, not just eventually.
export async function resolveShareToken(token: string): Promise<{ email: string; bikeId: string } | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<ShareLinkDoc>();
    if (!resource) return null;
    if (resource.expiresAt && new Date(resource.expiresAt) < new Date()) return null;
    return { email: resource.email, bikeId: resource.bikeId };
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

export async function deleteShareLink(token: string): Promise<void> {
  const container = getContainer();
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
    .query<{ id: string }>({
      query: "SELECT c.id FROM c WHERE c.type = 'shareLink' AND IS_DEFINED(c.expiresAt) AND c.expiresAt < @now",
      parameters: [{ name: "@now", value: nowIso }],
    })
    .fetchAll();
  for (const r of resources) {
    await container.item(r.id, r.id).delete();
  }
  return resources.length;
}
