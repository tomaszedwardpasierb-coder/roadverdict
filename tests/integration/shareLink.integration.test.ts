// Place at: tests/integration/shareLink.integration.test.ts
//
// Exercises src/lib/tracker/shareLink.ts against the real Cosmos DB
// Emulator. Share-link docs are partitioned by token, not by owner
// email - a completely different partition scheme from every other
// tracker doc type - and three of this file's functions
// (getShareLinksForUser, deleteExpiredShareLinks,
// getShareLinksNeedingFollowUp) are genuine cross-partition scans of the
// whole container. A mocked @/lib/cosmos can never catch a real syntax
// error in that SQL (IS_DEFINED, NOT IS_DEFINED, string comparison on
// ISO date columns) or a wrong partition-key assumption; this file can.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createShareLink,
  deleteExpiredShareLinks,
  deleteShareLink,
  extendShareLink,
  getShareLinksForUser,
  getShareLinksNeedingFollowUp,
  markShareLinkFollowUpSent,
  resolveShareToken,
  updateShareLinkAskingPrice,
} from "@/lib/tracker/shareLink";
import { getContainer } from "@/lib/cosmos";
import { cleanupPartition, testPk } from "./testCosmos";

describe("shareLink.ts against a real Cosmos container (emulator)", () => {
  let pks: string[];

  beforeEach(() => {
    pks = [];
  });

  afterEach(async () => {
    await Promise.all(pks.map((pk) => cleanupPartition(pk)));
  });

  // Share-link docs are partitioned by their own token, not by email -
  // every token this suite creates has to be tracked and cleaned up
  // individually, unlike every other integration suite here where one
  // pk covers everything a test created.
  function trackToken(token: string): string {
    pks.push(token);
    return token;
  }

  it("creates a link and resolves it back to the owning bike", async () => {
    const email = testPk("create-resolve");
    const link = await createShareLink(email, "bike-1", "1month", "buyer@example.com", 4500);
    trackToken(link.id);

    const resolved = await resolveShareToken(link.id);
    expect(resolved).toEqual({ email, bikeId: "bike-1", recipientEmail: "buyer@example.com", askingPrice: 4500 });
  });

  it("treats an already-expired link as if it doesn't exist, even though the document is still there", async () => {
    const email = testPk("expired");
    const link = await createShareLink(email, "bike-1", "1week", "buyer@example.com");
    trackToken(link.id);

    // Force it into the past directly, same as time simply passing would.
    const container = getContainer();
    await container.items.upsert({ ...link, expiresAt: new Date(Date.now() - 1000).toISOString() });

    expect(await resolveShareToken(link.id)).toBeNull();
    // The underlying document genuinely still exists - resolution just refuses it.
    const { resource: stillOnDisk } = await container.item(link.id, link.id).read();
    expect(stillOnDisk).toBeDefined();
  });

  it("lists every link for one owner via the cross-partition scan, newest first", async () => {
    const email = testPk("list-for-user");
    const older = await createShareLink(email, "bike-1", "1week", "one@example.com");
    trackToken(older.id);
    const newer = await createShareLink(email, "bike-1", "1month", "two@example.com");
    trackToken(newer.id);
    // A link for a different owner must never show up in this owner's list.
    const otherEmail = testPk("list-for-user-other-owner");
    const otherOwnersLink = await createShareLink(otherEmail, "bike-9", "1week", "three@example.com");
    trackToken(otherOwnersLink.id);

    const results = await getShareLinksForUser(email);
    expect(results.map((r) => r.id)).toEqual([newer.id, older.id]);
  });

  it("extends an expiry date in place", async () => {
    const email = testPk("extend");
    const link = await createShareLink(email, "bike-1", "1week", "buyer@example.com");
    trackToken(link.id);

    const extended = await extendShareLink(link.id, "6months");
    expect(new Date(extended!.expiresAt!).getTime()).toBeGreaterThan(new Date(link.expiresAt!).getTime());
  });

  it("sets then genuinely clears an asking price (deletes the field, doesn't just null it)", async () => {
    const email = testPk("asking-price");
    const link = await createShareLink(email, "bike-1", "1week", "buyer@example.com", 3000);
    trackToken(link.id);

    await updateShareLinkAskingPrice(link.id, null);

    const container = getContainer();
    const { resource: raw } = await container.item(link.id, link.id).read();
    expect(Object.prototype.hasOwnProperty.call(raw, "askingPrice")).toBe(false);
  });

  it("deletes a link so resolving it afterward returns null", async () => {
    const email = testPk("delete");
    const link = await createShareLink(email, "bike-1", "1week", "buyer@example.com");
    trackToken(link.id);

    await deleteShareLink(link.id);
    expect(await resolveShareToken(link.id)).toBeNull();
  });

  it("deleteExpiredShareLinks physically removes only genuinely-expired links, via a real cross-partition query", async () => {
    const email = testPk("delete-expired");
    const expired = await createShareLink(email, "bike-1", "1week", "buyer@example.com");
    trackToken(expired.id);
    const container = getContainer();
    await container.items.upsert({ ...expired, expiresAt: new Date(Date.now() - 1000).toISOString() });

    const stillValid = await createShareLink(email, "bike-1", "6months", "buyer2@example.com");
    trackToken(stillValid.id);

    const deletedCount = await deleteExpiredShareLinks();
    expect(deletedCount).toBeGreaterThanOrEqual(1);

    const { resource: expiredGone } = await container.item(expired.id, expired.id).read();
    expect(expiredGone).toBeUndefined();
    const { resource: validStillThere } = await container.item(stillValid.id, stillValid.id).read();
    expect(validStillThere).toBeDefined();
  });

  it("getShareLinksNeedingFollowUp finds an old-enough link with a recipient, via IS_DEFINED/NOT IS_DEFINED", async () => {
    const email = testPk("follow-up");
    const dueLink = await createShareLink(email, "bike-1", "1week", "buyer@example.com");
    trackToken(dueLink.id);
    const container = getContainer();
    // Back-date creation past the 28-day follow-up threshold.
    await container.items.upsert({
      ...dueLink,
      createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    });

    // A link created yesterday must not show up yet.
    const tooRecentLink = await createShareLink(email, "bike-2", "1week", "buyer2@example.com");
    trackToken(tooRecentLink.id);

    const dueForFollowUp = await getShareLinksNeedingFollowUp();
    const ids = dueForFollowUp.map((l) => l.id);
    expect(ids).toContain(dueLink.id);
    expect(ids).not.toContain(tooRecentLink.id);

    await markShareLinkFollowUpSent(dueLink.id);
    const afterMarking = await getShareLinksNeedingFollowUp();
    expect(afterMarking.map((l) => l.id)).not.toContain(dueLink.id);
  });
});
