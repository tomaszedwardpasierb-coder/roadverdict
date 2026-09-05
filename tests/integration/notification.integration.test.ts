// Place at: tests/integration/notification.integration.test.ts
//
// Exercises src/lib/tracker/notification.ts against the real Cosmos DB
// Emulator - both of its cross-partition queries (getAllUserEmails,
// scanning every 'user' doc; and the best-effort fan-out in
// createBroadcastNotifications, one write per recipient partition) are
// exactly the kind of thing a mocked container can't prove works.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createBroadcastNotifications,
  getAllUserEmails,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
  getBroadcastSummaries,
  clearNotifications,
  purgeOldNotifications,
} from "@/lib/tracker/notification";
import { getContainer } from "@/lib/cosmos";
import { cleanupPartition, testPk } from "./testCosmos";

// Writes a notification doc directly, bypassing createBroadcastNotifications
// (which always stamps "now") - purgeOldNotifications needs fixtures with
// specific past createdAt/readAt values to prove its date-cutoff logic
// against the real query engine, not just its own generated timestamps.
async function createRawNotification(pk: string, overrides: { createdAt: string; readAt?: string; title?: string; body?: string }) {
  const container = getContainer();
  const id = crypto.randomUUID();
  await container.items.create({
    id,
    pk,
    type: "notification",
    kind: "broadcast",
    title: overrides.title ?? "Test",
    body: overrides.body ?? "Body",
    createdAt: overrides.createdAt,
    ...(overrides.readAt ? { readAt: overrides.readAt } : {}),
  });
  return id;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("notification.ts against a real Cosmos container (emulator)", () => {
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

  it("fans a broadcast out to every recipient's own partition", async () => {
    const emailA = trackPk("broadcast-a");
    const emailB = trackPk("broadcast-b");

    await createBroadcastNotifications([emailA, emailB], { title: "Heads up", body: "New feature shipped." });

    const notificationsA = await getNotificationsForUser(emailA);
    const notificationsB = await getNotificationsForUser(emailB);
    expect(notificationsA).toHaveLength(1);
    expect(notificationsB).toHaveLength(1);
    expect(notificationsA[0]).toMatchObject({ title: "Heads up", body: "New feature shipped.", pk: emailA });
  });

  it("a broadcast to one real recipient and one that fails doesn't lose the one that succeeded", async () => {
    // Not simulating an actual Cosmos failure here (that's already
    // proven at the unit level with a mocked rejection) - this instead
    // confirms create() against a genuinely invalid partition key value
    // doesn't stop the OTHER, valid recipient's write from landing.
    const emailA = trackPk("partial-broadcast-a");
    const badEmail = ""; // an empty pk is rejected by real Cosmos

    await createBroadcastNotifications([emailA, badEmail], { title: "Test", body: "Body" });

    const notificationsA = await getNotificationsForUser(emailA);
    expect(notificationsA).toHaveLength(1);
  });

  it("getAllUserEmails scans across every partition for real 'user' docs - a genuine cross-partition query", async () => {
    const emailA = trackPk("user-emails-a");
    const emailB = trackPk("user-emails-b");
    const container = getContainer();
    await container.items.upsert({ id: emailA, pk: emailA, type: "user", email: emailA, createdAt: new Date().toISOString() });
    await container.items.upsert({ id: emailB, pk: emailB, type: "user", email: emailB, createdAt: new Date().toISOString() });

    const emails = await getAllUserEmails();
    expect(emails).toContain(emailA);
    expect(emails).toContain(emailB);
  });

  it("getUnreadNotificationCount counts only notifications missing readAt, scoped to one partition", async () => {
    const email = trackPk("unread-count");
    await createBroadcastNotifications([email], { title: "One", body: "..." });
    await createBroadcastNotifications([email], { title: "Two", body: "..." });
    expect(await getUnreadNotificationCount(email)).toBe(2);

    const [first] = await getNotificationsForUser(email);
    await markNotificationRead(first.id, email);
    expect(await getUnreadNotificationCount(email)).toBe(1);
  });

  it("markAllNotificationsRead marks every unread notification in the partition, leaving none uncounted", async () => {
    const email = trackPk("mark-all-read");
    await createBroadcastNotifications([email], { title: "One", body: "..." });
    await createBroadcastNotifications([email], { title: "Two", body: "..." });
    expect(await getUnreadNotificationCount(email)).toBe(2);

    await markAllNotificationsRead(email);
    expect(await getUnreadNotificationCount(email)).toBe(0);

    const all = await getNotificationsForUser(email);
    expect(all.every((n) => n.readAt)).toBe(true);
  });

  it("getNotificationsForUser is scoped to its own partition - another user's notifications never leak in", async () => {
    const emailA = trackPk("isolation-a");
    const emailB = trackPk("isolation-b");
    await createBroadcastNotifications([emailA], { title: "Only for A", body: "..." });

    expect(await getNotificationsForUser(emailB)).toEqual([]);
  });

  it("getBroadcastSummaries groups per-recipient docs from the same send by (title, body, createdAt)", async () => {
    const emailA = trackPk("summary-a");
    const emailB = trackPk("summary-b");
    await createBroadcastNotifications([emailA, emailB], { title: "Group me", body: "Same send" });

    const summaries = await getBroadcastSummaries();
    const match = summaries.find((s) => s.title === "Group me" && s.body === "Same send");
    expect(match).toBeDefined();
    expect(match?.recipientCount).toBe(2);
  });

  it("clearNotifications('all' broadcasts, specific recipients) only deletes for the named recipients", async () => {
    const emailA = trackPk("clear-specific-a");
    const emailB = trackPk("clear-specific-b");
    await createBroadcastNotifications([emailA, emailB], { title: "Clear me", body: "..." });

    const deleted = await clearNotifications({ broadcasts: "all", recipients: [emailA] });
    expect(deleted).toBe(1);
    expect(await getNotificationsForUser(emailA)).toEqual([]);
    expect(await getNotificationsForUser(emailB)).toHaveLength(1);
  });

  it("clearNotifications with a specific broadcast filter leaves other notifications for the same user untouched", async () => {
    const email = trackPk("clear-specific-broadcast");
    await createBroadcastNotifications([email], { title: "Keep me", body: "..." });
    await createBroadcastNotifications([email], { title: "Delete me", body: "..." });

    const all = await getNotificationsForUser(email);
    const toDelete = all.find((n) => n.title === "Delete me")!;

    const deleted = await clearNotifications({
      broadcasts: [{ title: toDelete.title, body: toDelete.body, createdAt: toDelete.createdAt }],
      recipients: "all",
    });
    expect(deleted).toBe(1);

    const remaining = await getNotificationsForUser(email);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].title).toBe("Keep me");
  });

  it("purgeOldNotifications deletes a read notification past the read-retention cutoff", async () => {
    const email = trackPk("purge-old-read");
    await createRawNotification(email, { createdAt: daysAgo(200), readAt: daysAgo(120) });

    await purgeOldNotifications();

    expect(await getNotificationsForUser(email)).toEqual([]);
  });

  it("purgeOldNotifications keeps a recently-read notification", async () => {
    const email = trackPk("purge-recent-read");
    await createRawNotification(email, { createdAt: daysAgo(10), readAt: daysAgo(5) });

    await purgeOldNotifications();

    expect(await getNotificationsForUser(email)).toHaveLength(1);
  });

  it("purgeOldNotifications keeps an unread notification that isn't yet ancient", async () => {
    const email = trackPk("purge-unread-not-ancient");
    await createRawNotification(email, { createdAt: daysAgo(100) });

    await purgeOldNotifications();

    expect(await getNotificationsForUser(email)).toHaveLength(1);
  });

  it("purgeOldNotifications deletes an unread notification once it's genuinely ancient", async () => {
    const email = trackPk("purge-unread-ancient");
    await createRawNotification(email, { createdAt: daysAgo(400) });

    await purgeOldNotifications();

    expect(await getNotificationsForUser(email)).toEqual([]);
  });
});
