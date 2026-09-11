// Place at: src/lib/tracker/notification.ts
//
// One document per recipient, even for a broadcast sent to many users
// at once - this keeps the read side (a single user's own bell) a
// simple, partition-scoped query, consistent with how every other
// document type in this app is partitioned by owner email, rather than
// introducing a separate "global, unpartitioned" query pattern just for
// this one feature. The fan-out cost sits on the admin's rare send
// action instead, which is the right trade-off given reads (every
// dashboard load, for every user) happen far more often than a send.
//
// Deliberately separate from the existing pulsing nav dots (items
// needing review, an incoming ownership request) - those are computed
// live from real, underlying data and stay exactly as they are. This
// is an additive log for things that don't already have a natural home
// elsewhere, starting with admin-sent messages.
import { getContainer } from "@/lib/cosmos";
import { stripCosmosMetadata } from "@/lib/tracker/cosmosHelpers";

export interface NotificationDoc {
  id: string;
  pk: string; // recipient email
  type: "notification";
  // "reminder" is created by the daily check-reminders cron whenever a
  // reminder first crosses into "due soon" or "overdue" - available to
  // every account regardless of Pro status, unlike the separate
  // automated reminder EMAIL (which stays a Premium perk - see that
  // cron's own comment). Deduped per reminder/per transition via
  // ReminderDoc's dueSoonBellNotifiedAt/overdueBellNotifiedAt, not
  // anything on this doc itself.
  kind: "broadcast" | "reminder";
  title: string;
  body: string;
  // Optional in-app path to navigate to when the notification is
  // clicked - e.g. "/dashboard" isn't useful since that's already the
  // default, but a specific tab or a link elsewhere might be.
  linkTo?: string;
  createdAt: string;
  // Absent (not just false) until read, so a query for "unread" can
  // simply check for the field's absence rather than a boolean - avoids
  // ever needing a migration for documents created before a readAt
  // field existed.
  readAt?: string;
}

export async function createBroadcastNotifications(
  recipientEmails: string[],
  data: { title: string; body: string; linkTo?: string }
): Promise<void> {
  const container = getContainer();
  const now = new Date().toISOString();
  // Best-effort per recipient, not all-or-nothing - one failed write
  // among hundreds shouldn't be able to make the admin believe the
  // entire broadcast failed to send when the vast majority went out
  // fine. Logged, not silently dropped, so a real, systemic failure is
  // still visible.
  const results = await Promise.allSettled(
    recipientEmails.map((email) =>
      container.items.create({
        id: crypto.randomUUID(),
        pk: email,
        type: "notification",
        kind: "broadcast",
        title: data.title,
        body: data.body,
        linkTo: data.linkTo,
        createdAt: now,
      } satisfies NotificationDoc)
    )
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`createBroadcastNotifications: ${failures.length} of ${recipientEmails.length} recipient(s) failed to receive the notification:`, failures);
  }
}

// Single-recipient counterpart to createBroadcastNotifications above -
// one reminder crossing into "due soon"/"overdue" only ever concerns the
// one account that owns it, never a fan-out list.
export async function createReminderNotification(
  email: string,
  data: { title: string; body: string; linkTo?: string }
): Promise<void> {
  const container = getContainer();
  await container.items.create({
    id: crypto.randomUUID(),
    pk: email,
    type: "notification",
    kind: "reminder",
    title: data.title,
    body: data.body,
    linkTo: data.linkTo,
    createdAt: new Date().toISOString(),
  } satisfies NotificationDoc);
}

// Every "user" document ever created - see createSessionForEmail in
// session.ts, which writes one the first time anyone signs in,
// independent of whether they ever add a bike. This is the genuinely
// complete recipient list a "send to everyone" broadcast needs; a list
// built from bike ownership alone would miss someone who signed in but
// never got that far.
export async function getAllUserEmails(): Promise<string[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ email: string }>({
      query: "SELECT c.email FROM c WHERE c.type = 'user'",
    })
    .fetchAll();
  return resources.map((r) => r.email);
}

export async function getNotificationsForUser(email: string, limit = 20): Promise<NotificationDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<NotificationDoc>(
      {
        query: "SELECT * FROM c WHERE c.type = 'notification' ORDER BY c.createdAt DESC OFFSET 0 LIMIT @limit",
        parameters: [{ name: "@limit", value: limit }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.map(stripCosmosMetadata);
}

export async function getUnreadNotificationCount(email: string): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<number>(
      {
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'notification' AND NOT IS_DEFINED(c.readAt)",
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources[0] ?? 0;
}

export async function markNotificationRead(id: string, email: string): Promise<void> {
  const container = getContainer();
  await container.item(id, email).patch([{ op: "add", path: "/readAt", value: new Date().toISOString() }]);
}

export async function markAllNotificationsRead(email: string): Promise<void> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'notification' AND NOT IS_DEFINED(c.readAt)",
      },
      { partitionKey: email }
    )
    .fetchAll();
  const now = new Date().toISOString();
  // Best-effort per item, same reasoning as createBroadcastNotifications
  // above - one failed patch shouldn't be able to make the rest of a
  // "mark all read" action silently fail too.
  const results = await Promise.allSettled(
    resources.map((r) => container.item(r.id, email).patch([{ op: "add", path: "/readAt", value: now }]))
  );
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`markAllNotificationsRead: ${failures.length} of ${resources.length} notification(s) failed to update for ${email}:`, failures);
  }
}

const READ_NOTIFICATION_RETENTION_DAYS = 90;
const MAX_NOTIFICATION_RETENTION_DAYS = 365;

// Cross-partition, same accepted exception as shareLink.ts's own
// expiry cleanup - only ever called from a periodic purge cron, never
// a hot path. Notification docs have no Cosmos ttl of their own (they
// need to actually be read/seen first, which a ttl can't express), so
// this is what keeps them from growing forever: a read one has served
// its purpose after READ_NOTIFICATION_RETENTION_DAYS, and even an
// unread one is purged once it's genuinely ancient.
export async function purgeOldNotifications(): Promise<number> {
  const container = getContainer();
  const readCutoff = new Date();
  readCutoff.setDate(readCutoff.getDate() - READ_NOTIFICATION_RETENTION_DAYS);
  const maxCutoff = new Date();
  maxCutoff.setDate(maxCutoff.getDate() - MAX_NOTIFICATION_RETENTION_DAYS);

  const { resources } = await container.items
    .query<{ id: string; pk: string }>({
      query:
        "SELECT c.id, c.pk FROM c WHERE c.type = 'notification' AND ((IS_DEFINED(c.readAt) AND c.readAt < @readCutoff) OR c.createdAt < @maxCutoff)",
      parameters: [
        { name: "@readCutoff", value: readCutoff.toISOString() },
        { name: "@maxCutoff", value: maxCutoff.toISOString() },
      ],
    })
    .fetchAll();

  const results = await Promise.allSettled(resources.map((r) => container.item(r.id, r.pk).delete()));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`purgeOldNotifications: ${failures.length} of ${resources.length} failed to delete:`, failures);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}

export interface BroadcastSummary {
  title: string;
  body: string;
  createdAt: string;
  recipientCount: number;
}

// Distinct broadcasts ever sent, newest first, each with how many
// recipients it reached - the admin-facing identity of "one sent
// notification", since individual per-recipient docs share no explicit
// batch id (see createBroadcastNotifications above) but do share an
// identical (title, body, createdAt) triple from one fan-out.
export async function getBroadcastSummaries(): Promise<BroadcastSummary[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ title: string; body: string; createdAt: string }>({
      query: "SELECT c.title, c.body, c.createdAt FROM c WHERE c.type = 'notification'",
    })
    .fetchAll();
  const byKey = new Map<string, BroadcastSummary>();
  for (const r of resources) {
    const key = `${r.createdAt} ${r.title} ${r.body}`;
    const existing = byKey.get(key);
    if (existing) existing.recipientCount += 1;
    else byKey.set(key, { title: r.title, body: r.body, createdAt: r.createdAt, recipientCount: 1 });
  }
  return [...byKey.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// Uncapped version of getNotificationsForUser above - admin-only use,
// where clearing needs to see (and potentially delete) every
// notification a user has, not just the most recent 20 a dashboard
// bell needs.
async function getAllNotificationsForUser(email: string): Promise<NotificationDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<NotificationDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'notification'" },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.map(stripCosmosMetadata);
}

export interface ClearNotificationsFilter {
  broadcasts: "all" | { title: string; body: string; createdAt: string }[];
  recipients: "all" | string[];
}

function matchesBroadcastFilter(doc: NotificationDoc, broadcasts: ClearNotificationsFilter["broadcasts"]): boolean {
  if (broadcasts === "all") return true;
  return broadcasts.some((b) => b.title === doc.title && b.body === doc.body && b.createdAt === doc.createdAt);
}

// Deletes matching notifications across the given recipients (or every
// registered user). Best-effort per document, same reasoning as
// createBroadcastNotifications/markAllNotificationsRead above - one
// failed delete among many shouldn't stop the rest from actually
// clearing.
export async function clearNotifications(filter: ClearNotificationsFilter): Promise<number> {
  const container = getContainer();
  const recipientEmails = filter.recipients === "all" ? await getAllUserEmails() : filter.recipients;

  const perRecipientCounts = await Promise.all(
    recipientEmails.map(async (email) => {
      const docs = await getAllNotificationsForUser(email);
      const toDelete = docs.filter((d) => matchesBroadcastFilter(d, filter.broadcasts));
      if (toDelete.length === 0) return 0;
      const results = await Promise.allSettled(toDelete.map((d) => container.item(d.id, email).delete()));
      const failures = results.filter((r) => r.status === "rejected");
      if (failures.length > 0) {
        console.error(`clearNotifications: ${failures.length} of ${toDelete.length} failed to delete for ${email}:`, failures);
      }
      return results.filter((r) => r.status === "fulfilled").length;
    })
  );
  return perRecipientCounts.reduce((sum, n) => sum + n, 0);
}
