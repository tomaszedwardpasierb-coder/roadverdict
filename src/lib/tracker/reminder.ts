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
  // Independent from notifiedAt above (which gates the Pro-only
  // automated EMAIL - see check-reminders/route.ts) - these instead gate
  // the in-app BELL notification, available to every account regardless
  // of Pro status. Reset to null alongside notifiedAt whenever the
  // reminder is updated/rolled forward (see updateReminder below), so a
  // renewed reminder can notify again the next time it crosses into
  // "due soon"/"overdue".
  dueSoonBellNotifiedAt?: string | null;
  overdueBellNotifiedAt?: string | null;
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
  return createTrackerDoc<ReminderDoc>(email, "reminder", "reminder", {
    ...data,
    notifiedAt: null,
    dueSoonBellNotifiedAt: null,
    overdueBellNotifiedAt: null,
  });
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

// Resetting also clears notifiedAt and the two bell-notification flags,
// so if it crosses back into "due soon"/"overdue" in the future, both
// the cron's email and its bell notification are free to fire again.
export async function updateReminder(
  email: string,
  id: string,
  data: Partial<Omit<ReminderDoc, "id" | "pk" | "type" | "createdAt">>
): Promise<ReminderDoc | null> {
  return updateTrackerDoc<ReminderDoc>(email, id, {
    ...data,
    notifiedAt: null,
    dueSoonBellNotifiedAt: null,
    overdueBellNotifiedAt: null,
  });
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

export async function markReminderDueSoonBellNotified(email: string, id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<ReminderDoc>();
  if (!resource) return;
  resource.dueSoonBellNotifiedAt = new Date().toISOString();
  await container.items.upsert(resource);
}

export async function markReminderOverdueBellNotified(email: string, id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<ReminderDoc>();
  if (!resource) return;
  resource.overdueBellNotifiedAt = new Date().toISOString();
  await container.items.upsert(resource);
}

// Deliberately a fixed, well-known sourceKey rather than one derived per
// call site, matching deleteRemindersBySourceKey's existing dedup
// convention (see LogBillForm's own "Remind me" checkbox for the other
// established use of this pattern) - there is only ever at most one SORN
// reminder per bike at a time.
export const SORN_REMINDER_SOURCE_KEY = "vdg-tax-status";
export const SORN_REMINDER_NAME = "Vehicle is SORN (not taxed)";
// A second, independent reminder covering the opposite case: the
// vehicle IS currently taxed, so there's a real renewal date worth
// surfacing ahead of time - and, since this is a normal "date" reminder
// (not "permanent"), reminderStatus.ts's own date math already reports
// "overdue" for it without any extra code here if DVLA's own
// TaxDueDate ever turns out to be in the past (e.g. stale data between
// refreshes) - the same date-reminder machinery every other due-date
// reminder in this app already uses.
export const TAX_DUE_REMINDER_SOURCE_KEY = "vdg-tax-due-date";
export const TAX_DUE_REMINDER_NAME = "Road tax renewal due";

// The only place a "permanent" reminder is ever created or removed - see
// ReminderTrigger's own comment on why. Called after every DVLA tax-
// status check (vehicle creation, and the "Refresh vehicle data"
// button): keeps exactly one of two mutually-exclusive reminders in
// sync with the vehicle's current DVLA tax status, so there's always a
// reminder that reflects reality either way, never neither:
// - SORN'd: creates (or leaves alone, if already set) the permanent
//   "Vehicle is SORN" reminder, and removes any leftover tax-due
//   reminder from before it went SORN.
// - Taxed with a due date: removes the SORN reminder if present, and
//   replaces the tax-due reminder with one pointed at the current
//   TaxDueDate (a plain delete-then-recreate, same as MOT renewal
//   reminders in motHistoryImport.ts - safe to repeat on every refresh,
//   and rolls forward on its own once TaxDueDate advances to the next
//   period).
// - Taxed with no due date on record: removes both reminders - there's
//   nothing dated to point a reminder at.
export async function syncSornReminder(
  email: string,
  bikeId: string,
  taxStatus: string | null,
  taxDueDate?: string | null
): Promise<void> {
  const isSorn = taxStatus?.trim().toUpperCase() === "SORN";
  const existing = await getReminders(email, bikeId);
  const currentSorn = existing.find((r) => r.sourceKey === SORN_REMINDER_SOURCE_KEY);
  const currentTaxDue = existing.find((r) => r.sourceKey === TAX_DUE_REMINDER_SOURCE_KEY);

  if (isSorn) {
    if (!currentSorn) {
      await createReminder(email, {
        bikeId,
        name: SORN_REMINDER_NAME,
        intervalType: "permanent",
        date: new Date().toISOString().slice(0, 10),
        sourceKey: SORN_REMINDER_SOURCE_KEY,
      });
    }
    if (currentTaxDue) {
      await deleteRemindersBySourceKey(email, bikeId, TAX_DUE_REMINDER_SOURCE_KEY);
    }
    return;
  }

  if (currentSorn) {
    await deleteRemindersBySourceKey(email, bikeId, SORN_REMINDER_SOURCE_KEY);
  }

  if (taxDueDate) {
    await deleteRemindersBySourceKey(email, bikeId, TAX_DUE_REMINDER_SOURCE_KEY);
    await createReminder(email, {
      bikeId,
      name: TAX_DUE_REMINDER_NAME,
      intervalType: "date",
      exactDate: taxDueDate,
      date: new Date().toISOString().slice(0, 10),
      sourceKey: TAX_DUE_REMINDER_SOURCE_KEY,
    });
  } else if (currentTaxDue) {
    await deleteRemindersBySourceKey(email, bikeId, TAX_DUE_REMINDER_SOURCE_KEY);
  }
}

// Re-exported from reminderStatus.ts so existing server-side imports (the
// cron, dashboard/page.tsx) don't need to change. Any CLIENT component
// should import these directly from reminderStatus.ts instead - that file
// has zero Cosmos dependency, this one does, and importing a value from
// this file pulls the whole SDK into a browser bundle for no reason.
export { monthsBetween, computeReminderStatus, reminderDetailLabel } from "./reminderStatus";
