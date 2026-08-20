// Place at: src/lib/tracker/bikeTransferRequest.ts
//
// A pending offer to hand a bike's RoadVerdict record to another
// account - distinct from bikeTransfer.ts, which performs the actual
// transfer once a request here has been accepted. Deliberately mirrors
// receiptRequest.ts's own conventions (hashed token, TTL-based expiry,
// cross-partition lookup by token) rather than inventing a new pattern,
// since this is genuinely the same kind of thing: one party proposes an
// action, a token lets the other party act on it without needing to be
// signed in just to view what's being offered.
//
// initiatedBy exists from the start even though every request created
// today is "owner" - a future flow where a buyer who's just added a
// bike that's already tracked elsewhere can request the existing
// history (rather than the current owner proactively offering it) will
// reuse this exact same document shape, just with the roles reversed.
import { getContainer } from "@/lib/cosmos";
import { hashToken, generateToken } from "@/lib/auth/crypto";

export interface BikeTransferRequestDoc {
  id: string;
  pk: string; // owner's email - matches every other tracker doc's partitioning
  type: "bikeTransferRequest";
  bikeId: string;
  ownerEmail: string;
  recipientEmail: string;
  initiatedBy: "owner" | "recipient";
  status: "pending" | "accepted" | "declined";
  tokenHash: string;
  createdAt: string;
  decidedAt?: string;
  // Whether the previous owner's individual service/fuel/mod/bill
  // records (not just the bike-level facts and frozen summary) should
  // come along with the transfer. Only meaningful for owner-initiated
  // requests, where the owner decides this at the moment they create
  // the offer - a recipient-initiated request has no owner decision to
  // record yet at creation time, since the owner hasn't acted at all
  // until they approve it, which is where that choice gets made instead.
  includeRecords?: boolean;
  // Bike identity snapshotted at request time, so the recipient's offer
  // page and the emails can show what's being offered without a second
  // lookup, and so it still reads sensibly if the bike's own details
  // change before the offer is acted on.
  bikeSummary: { make: string; model: string; year?: number; isCustomBuild: boolean };
  ttl: number;
}

// A bigger decision than a 15-minute sign-in link deserves a longer
// window - someone might not see the email right away, and deciding
// whether to accept a bike is not a "do it in the next few minutes"
// kind of action.
const REQUEST_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function createBikeTransferRequest(params: {
  ownerEmail: string;
  bikeId: string;
  recipientEmail: string;
  bikeSummary: BikeTransferRequestDoc["bikeSummary"];
  initiatedBy?: "owner" | "recipient";
  includeRecords?: boolean;
}): Promise<{ doc: BikeTransferRequestDoc; token: string }> {
  const container = getContainer();
  const { raw: token, hash: tokenHash } = generateToken();

  const doc: BikeTransferRequestDoc = {
    id: `${params.ownerEmail}::bikeTransferRequest::${Date.now()}`,
    pk: params.ownerEmail,
    type: "bikeTransferRequest",
    bikeId: params.bikeId,
    ownerEmail: params.ownerEmail,
    recipientEmail: params.recipientEmail,
    initiatedBy: params.initiatedBy ?? "owner",
    status: "pending",
    tokenHash,
    createdAt: new Date().toISOString(),
    bikeSummary: params.bikeSummary,
    includeRecords: params.includeRecords,
    ttl: REQUEST_TTL_SECONDS,
  };

  await container.items.upsert(doc);
  return { doc, token };
}

// Single-partition query - the dashboard always knows the signed-in
// owner's email already, so this never needs the cross-partition token
// lookup below. Powers "waiting for [email] to accept" on the owner's
// own side.
export async function getPendingTransferRequestsForOwner(ownerEmail: string): Promise<BikeTransferRequestDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<BikeTransferRequestDoc>({
      query: "SELECT * FROM c WHERE c.pk = @email AND c.type = 'bikeTransferRequest' AND c.status = 'pending'",
      parameters: [{ name: "@email", value: ownerEmail }],
    })
    .fetchAll();
  return resources;
}

// Single-partition, same reasoning as above - used by the history
// follow-up cron to skip a bike that's already been requested or
// handed off before the 4-week email would fire. "Active" means
// pending or accepted; a declined request doesn't count, since someone
// declining one offer shouldn't permanently block a genuinely
// different buyer's follow-up email later.
export async function hasActiveTransferRequestForBike(ownerEmail: string, bikeId: string): Promise<boolean> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>({
      query:
        "SELECT c.id FROM c WHERE c.pk = @email AND c.type = 'bikeTransferRequest' AND c.bikeId = @bikeId AND (c.status = 'pending' OR c.status = 'accepted')",
      parameters: [
        { name: "@email", value: ownerEmail },
        { name: "@bikeId", value: bikeId },
      ],
    })
    .fetchAll();
  return resources.length > 0;
}

// Cross-partition - the recipient's link only ever carries the raw
// token, never the owner's email, so there's no partition to scope to
// upfront. Only ever called once per link click, so the extra query
// cost is a fine trade, same reasoning as the receipt-request version
// this mirrors.
export async function getBikeTransferRequestByToken(rawToken: string): Promise<BikeTransferRequestDoc | null> {
  const container = getContainer();
  const hash = hashToken(rawToken);
  const { resources } = await container.items
    .query<BikeTransferRequestDoc>({
      query: "SELECT * FROM c WHERE c.type = 'bikeTransferRequest' AND c.tokenHash = @hash",
      parameters: [{ name: "@hash", value: hash }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

// Direct read by id, same access pattern decideBikeTransferRequest
// uses internally - separated out so the owner-side approve/decline
// routes can inspect a request's details (bikeId, recipientEmail)
// before acting, without changing its status as a side effect of just
// looking at it.
export async function getBikeTransferRequestById(
  requestId: string,
  ownerEmail: string
): Promise<BikeTransferRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<BikeTransferRequestDoc>();
  return resource ?? null;
}

export async function decideBikeTransferRequest(
  requestId: string,
  ownerEmail: string,
  decision: "accepted" | "declined"
): Promise<BikeTransferRequestDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(requestId, ownerEmail).read<BikeTransferRequestDoc>();
  if (!resource) return null;
  resource.status = decision;
  resource.decidedAt = new Date().toISOString();
  await container.items.upsert(resource);
  return resource;
}
