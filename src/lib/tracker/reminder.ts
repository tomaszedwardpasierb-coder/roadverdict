// Place at: src/lib/tracker/reminder.ts
import { getContainer } from "@/lib/cosmos";
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";

export interface ReminderTrigger {
  intervalType: "mileage" | "months" | "date";
  intervalValue?: number;
  exactDate?: string;
}

export interface ReminderDoc extends TrackerDocBase {
  type: "reminder";
  name: string;
  intervalType: "mileage" | "months" | "date";
  intervalValue?: number;
  baseMileage?: number;
  exactDate?: string;
  sourceKey?: string;
  notifiedAt?: string | null;
  // Optional, additive - existing reminders simply have none. When
  // present, the reminder fires the moment ANY ONE of the primary
  // trigger (above) or these extra ones is reached - "whichever comes
  // first", e.g. "12,000 miles or 12 months".
  additionalTriggers?: ReminderTrigger[];
}

export async function createReminder(
  email: string,
  data: {
    bikeId: string;
    name: string;
    intervalType: "mileage" | "months" | "date";
    intervalValue?: number;
    baseMileage?: number;
    exactDate?: string;
    date: string;
    sourceKey?: string;
    additionalTriggers?: ReminderTrigger[];
  }
): Promise<ReminderDoc> {
  return createTrackerDoc<ReminderDoc>(email, "reminder", "reminder", { ...data, notifiedAt: null });
}

export async function getReminders(email: string, bikeId: string): Promise<ReminderDoc[]> {
  return queryTrackerDocs<ReminderDoc>(email, "reminder", bikeId);
}

// Resetting also clears notifiedAt, so if it crosses back into "overdue"
// in the future, the cron is free to email about it again.
export async function updateReminder(
  email: string,
  id: string,
  data: Partial<Omit<ReminderDoc, "id" | "pk" | "type" | "createdAt">>
): Promise<ReminderDoc | null> {
  return updateTrackerDoc<ReminderDoc>(email, id, { ...data, notifiedAt: null });
}

export async function deleteReminder(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}

// Replaces any existing reminder tied to the same job/bill type - used
// when logging a new service or bill that already has an active
// reminder, so there's never a duplicate for the same thing.
export async function deleteRemindersBySourceKey(email: string, bikeId: string, sourceKey: string): Promise<void> {
  const container = getContainer();
  const existing = await queryTrackerDocs<ReminderDoc>(email, "reminder", bikeId);
  const toDelete = existing.filter((r) => r.sourceKey === sourceKey);
  for (const r of toDelete) {
    await container.item(r.id, email).delete();
  }
}

// Cross-partition - scans every user's reminders. Only ever called by the
// once-a-day cron, never a normal page load, so the extra query cost is a
// deliberate exception to the single-partition pattern used everywhere
// else in this app.
export async function getAllReminders(): Promise<ReminderDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<ReminderDoc>({ query: "SELECT * FROM c WHERE c.type = 'reminder'" })
    .fetchAll();
  return resources;
}

export async function markReminderNotified(email: string, id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<ReminderDoc>();
  if (!resource) return;
  resource.notifiedAt = new Date().toISOString();
  await container.items.upsert(resource);
}

// Re-exported from reminderStatus.ts so existing server-side imports (the
// cron, dashboard/page.tsx) don't need to change. Any CLIENT component
// should import these directly from reminderStatus.ts instead - that file
// has zero Cosmos dependency, this one does, and importing a value from
// this file pulls the whole SDK into a browser bundle for no reason.
export { monthsBetween, computeReminderStatus, reminderDetailLabel } from "./reminderStatus";
