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
  kind: "broadcast";
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
