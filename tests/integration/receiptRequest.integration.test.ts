// Place at: tests/integration/receiptRequest.integration.test.ts
//
// Exercises src/lib/tracker/receiptRequest.ts against the real Cosmos DB
// Emulator - the token-hash lookups (getReceiptRequestByDecisionToken),
// the cross-request findPriorDecline scan inside
// getPendingReceiptRequestsForOwner, and purgeOrphanedReceiptRequests'
// cross-partition existence check against a real shareLink doc are all
// exactly the kind of thing a mocked container can't prove works.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canSendReminder,
  createReceiptRequest,
  decideReceiptRequestItems,
  deleteReceiptRequestsForShareToken,
  DEFAULT_DECLINE_REASON,
  getPendingReceiptRequestsForOwner,
  getReceiptRequestByDecisionToken,
  getReceiptRequestsForShareToken,
  purgeOrphanedReceiptRequests,
  recordReminderSent,
  regenerateDecisionToken,
} from "@/lib/tracker/receiptRequest";
import { getContainer } from "@/lib/cosmos";
import { cleanupPartition, testPk } from "./testCosmos";

function items() {
  return [{ entryId: "e1", category: "service" as const, description: "Full service" }];
}

describe("receiptRequest.ts against a real Cosmos container (emulator)", () => {
  let pks: string[];

  beforeEach(() => {
    pks = [];
  });

  afterEach(async () => {
    await Promise.all(pks.map((pk) => cleanupPartition(pk)));
  });

  function trackPk(label: string): string {
    const pk = testPk(label);
    pks.push(pk);
    return pk;
  }

  it("creates a request and resolves it back by its real decision token", async () => {
    const owner = trackPk("create-resolve");
    const { doc, decisionToken } = await createReceiptRequest({
      ownerEmail: owner,
      shareToken: "tok-1",
      bikeId: "bike-1",
      buyerEmail: "buyer@example.com",
      items: items(),
    });

    const resolved = await getReceiptRequestByDecisionToken(decisionToken);
    expect(resolved?.id).toBe(doc.id);

    expect(await getReceiptRequestByDecisionToken("wrong-token")).toBeNull();
  });

  it("getReceiptRequestsForShareToken is scoped to the owner's partition and filters by shareToken", async () => {
    const owner = trackPk("by-share-token");
    const forThisLink = await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-a", bikeId: "bike-1", items: items() });
    await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-b", bikeId: "bike-1", items: items() });

    const results = await getReceiptRequestsForShareToken(owner, "tok-a");
    expect(results.map((r) => r.id)).toEqual([forThisLink.doc.id]);
  });

  it("decideReceiptRequestItems approves, declines with a real default reason, and reverts to pending on the real document", async () => {
    const owner = trackPk("decide-items");
    const { doc } = await createReceiptRequest({
      ownerEmail: owner,
      shareToken: "tok-1",
      bikeId: "bike-1",
      items: [
        { entryId: "e1", category: "service", description: "Full service" },
        { entryId: "e2", category: "bills", description: "New tyres" },
      ],
    });

    const afterApprove = await decideReceiptRequestItems(doc.id, owner, ["e1"], "approved");
    expect(afterApprove?.items.find((i) => i.entryId === "e1")).toMatchObject({ status: "approved" });

    const afterDecline = await decideReceiptRequestItems(doc.id, owner, ["e2"], "declined");
    expect(afterDecline?.items.find((i) => i.entryId === "e2")).toMatchObject({
      status: "declined",
      reason: DEFAULT_DECLINE_REASON,
    });

    const afterRevert = await decideReceiptRequestItems(doc.id, owner, ["e1"], "pending");
    const reverted = afterRevert?.items.find((i) => i.entryId === "e1");
    expect(reverted?.status).toBe("pending");
    expect(reverted).not.toHaveProperty("decidedAt");
  });

  it("getPendingReceiptRequestsForOwner flags a prior decline of the same entry from a different request", async () => {
    const owner = trackPk("prior-decline");
    const older = await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-old", bikeId: "bike-1", items: items() });
    await decideReceiptRequestItems(older.doc.id, owner, ["e1"], "declined", "Contains my address");

    const newer = await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-new", bikeId: "bike-1", items: items() });

    const pending = await getPendingReceiptRequestsForOwner(owner);
    const newerView = pending.find((r) => r.id === newer.doc.id);
    expect(newerView?.items[0].priorDecline).toMatchObject({ reason: "Contains my address" });
  });

  it("deleteReceiptRequestsForShareToken cascades to every request tied to that link, in that owner's partition", async () => {
    const owner = trackPk("delete-cascade");
    await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-1", bikeId: "bike-1", items: items() });
    await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-1", bikeId: "bike-1", items: items() });
    const otherLink = await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-2", bikeId: "bike-1", items: items() });

    const deletedCount = await deleteReceiptRequestsForShareToken(owner, "tok-1");
    expect(deletedCount).toBe(2);
    expect(await getReceiptRequestsForShareToken(owner, "tok-1")).toEqual([]);
    expect(await getReceiptRequestsForShareToken(owner, "tok-2")).toHaveLength(1);
    expect((await getReceiptRequestsForShareToken(owner, "tok-2"))[0].id).toBe(otherLink.doc.id);
  });

  it("purgeOrphanedReceiptRequests deletes only requests whose real shareLink doc is genuinely gone", async () => {
    const owner = trackPk("purge-orphans");
    const container = getContainer();
    // A real, still-existing shareLink doc (partitioned by its own token/id, per shareLink.ts).
    await container.items.upsert({ id: "still-here", pk: "still-here", type: "shareLink", email: owner, bikeId: "bike-1", createdAt: new Date().toISOString() });
    pks.push("still-here");

    const orphaned = await createReceiptRequest({ ownerEmail: owner, shareToken: "gone-forever", bikeId: "bike-1", items: items() });
    const notOrphaned = await createReceiptRequest({ ownerEmail: owner, shareToken: "still-here", bikeId: "bike-1", items: items() });

    const deletedCount = await purgeOrphanedReceiptRequests();
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    const orphanedStillThere = await getReceiptRequestsForShareToken(owner, "gone-forever");
    expect(orphanedStillThere.find((r) => r.id === orphaned.doc.id)).toBeUndefined();
    const notOrphanedStillThere = await getReceiptRequestsForShareToken(owner, "still-here");
    expect(notOrphanedStillThere.find((r) => r.id === notOrphaned.doc.id)).toBeDefined();
  });

  it("canSendReminder/recordReminderSent enforce a real cooldown against the actual stored timestamp", async () => {
    const owner = trackPk("reminder-cooldown");
    const { doc } = await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-1", bikeId: "bike-1", items: items() });

    expect(canSendReminder(doc)).toBe(true);
    await recordReminderSent(doc.id, owner);

    const [refetched] = await getReceiptRequestsForShareToken(owner, "tok-1");
    expect(canSendReminder(refetched)).toBe(false);
  });

  it("regenerateDecisionToken rotates the hash so the old token stops resolving and the new one works", async () => {
    const owner = trackPk("regenerate-token");
    const { doc, decisionToken: oldToken } = await createReceiptRequest({ ownerEmail: owner, shareToken: "tok-1", bikeId: "bike-1", items: items() });

    const newToken = await regenerateDecisionToken(doc.id, owner);
    expect(newToken).toBeTruthy();

    expect(await getReceiptRequestByDecisionToken(oldToken)).toBeNull();
    expect((await getReceiptRequestByDecisionToken(newToken!))?.id).toBe(doc.id);
  });
});
