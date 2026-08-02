// Place at: src/lib/tracker/reminder.ts
import { getContainer } from "@/lib/cosmos";
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";

export interface ReminderDoc extends TrackerDocBase {
  type: "reminder";
  name: string;
  intervalType: "mileage" | "months" | "date";
  intervalValue?: number;
  baseMileage?: number;
  exactDate?: string;
  sourceKey?: string;
  notifiedAt?: string | null;
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

export function monthsBetween(d1: Date, d2: Date): number {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

export function computeReminderStatus(r: ReminderDoc, currentMileage: number): "ok" | "due-soon" | "overdue" {
  if (r.intervalType === "date" && r.exactDate) {
    const daysRemaining = (new Date(r.exactDate).getTime() - Date.now()) / 86400000;
    if (daysRemaining <= 0) return "overdue";
    if (daysRemaining <= 14) return "due-soon";
    return "ok";
  }
  let pct = 0;
  if (r.intervalType === "mileage" && r.intervalValue) {
    pct = (currentMileage - (r.baseMileage ?? 0)) / r.intervalValue;
  } else if (r.intervalType === "months" && r.intervalValue) {
    const months = monthsBetween(new Date(r.date), new Date());
    pct = months / r.intervalValue;
  }
  if (pct >= 1) return "overdue";
  if (pct >= 0.85) return "due-soon";
  return "ok";
}

export function reminderDetailLabel(r: ReminderDoc): string {
  if (r.intervalType === "date" && r.exactDate) {
    return `due on ${new Date(r.exactDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (r.intervalType === "mileage" && r.intervalValue) {
    const due = (r.baseMileage ?? 0) + r.intervalValue;
    return `due around ${due.toLocaleString()} miles (every ${r.intervalValue.toLocaleString()} mi)`;
  }
  if (r.intervalType === "months" && r.intervalValue) {
    const base = new Date(r.date);
    const due = new Date(base.getFullYear(), base.getMonth() + r.intervalValue, base.getDate());
    return `due around ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} (every ${r.intervalValue} months)`;
  }
  return "";
}
