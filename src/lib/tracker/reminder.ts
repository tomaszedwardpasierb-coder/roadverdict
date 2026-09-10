// Place at: src/lib/tracker/reminder.ts
import { getContainer } from "@/lib/cosmos";
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";

// "permanent" is a deliberate fourth kind alongside the normal
// interval-based three: it never resolves via date/mileage math at all
// (see reminderStatus.ts's triggerStatus - it always reports "overdue"
// and never computes a due point). Used exclusively for the DVLA
// tax/SORN check below - a SORN'd vehicle isn't "due soon", it's
// unlawful to drive right now, and there is no sensible date or mileage
// to roll the reminder forward to. Only ever created/removed by
// syncSornReminder, never by a normal user-facing "add a reminder" form -
// see ReminderItem.tsx, which hides the manual Done/Delete actions for
// this type for exactly that reason.
export type ReminderIntervalType = "mileage" | "months" | "date" | "permanent";

export interface ReminderTrigger {
  intervalType: ReminderIntervalType;
  intervalValue?: number;
  exactDate?: string;
}

export interface ReminderDoc extends TrackerDocBase {
  type: "reminder";
  name: string;
  intervalType: ReminderIntervalType;
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
    intervalType: ReminderIntervalType;
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

// Point-read by id, unlike getReminders above (which lists every
// reminder for a bike) - needed wherever a route only has the reminder's
// own id and must check something about it (its intervalType, say)
// before deciding whether an action is even allowed.
export async function getReminderById(email: string, id: string): Promise<ReminderDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<ReminderDoc>();
  return resource ?? null;
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

// Deliberately a fixed, well-known sourceKey rather than one derived per
// call site, matching deleteRemindersBySourceKey's existing dedup
// convention (see LogBillForm's own "Remind me" checkbox for the other
// established use of this pattern) - there is only ever at most one SORN
// reminder per bike at a time.
export const SORN_REMINDER_SOURCE_KEY = "vdg-tax-status";
export const SORN_REMINDER_NAME = "Vehicle is SORN (not taxed)";

// The only place a "permanent" reminder is ever created or removed - see
// ReminderTrigger's own comment on why. Called after every DVLA tax-
// status check (vehicle creation, and the "Refresh vehicle data" button):
// creates the reminder the first time the vehicle is found SORN'd, does
// nothing on every later check that's still SORN'd (so an already-set
// reminder doesn't get its createdAt/notifiedAt state reset for no
// reason), and removes it the moment the vehicle is confirmed taxed again.
export async function syncSornReminder(email: string, bikeId: string, taxStatus: string | null): Promise<void> {
  const isSorn = taxStatus?.trim().toUpperCase() === "SORN";
  const existing = await getReminders(email, bikeId);
  const current = existing.find((r) => r.sourceKey === SORN_REMINDER_SOURCE_KEY);
  if (isSorn) {
    if (!current) {
      await createReminder(email, {
        bikeId,
        name: SORN_REMINDER_NAME,
        intervalType: "permanent",
        date: new Date().toISOString().slice(0, 10),
        sourceKey: SORN_REMINDER_SOURCE_KEY,
      });
    }
  } else if (current) {
    await deleteRemindersBySourceKey(email, bikeId, SORN_REMINDER_SOURCE_KEY);
  }
}

// Re-exported from reminderStatus.ts so existing server-side imports (the
// cron, dashboard/page.tsx) don't need to change. Any CLIENT component
// should import these directly from reminderStatus.ts instead - that file
// has zero Cosmos dependency, this one does, and importing a value from
// this file pulls the whole SDK into a browser bundle for no reason.
export { monthsBetween, computeReminderStatus, reminderDetailLabel } from "./reminderStatus";
