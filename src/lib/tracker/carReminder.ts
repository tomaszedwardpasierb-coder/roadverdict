// Place at: src/lib/tracker/carReminder.ts
//
// Car equivalent of reminder.ts. Not part of Phase 2's original four
// record types (service/fuel/mod/bill) - reminders only became
// necessary once Phase 5 wired up manual logging forms and a car
// reminders route, so this is genuinely new here rather than moved.
// reminder.ts itself is left untouched: it's keyed on TrackerDocBase's
// pre-existing optional `bikeId` field via the generic (bikeId-
// hardcoded) queryTrackerDocs, so it can't be reused for cars without
// either changing that shared query or duplicating it - same reasoning
// that produced queryCarTrackerDocs in car.ts for every other record
// type, applied consistently here too.
import { getContainer } from "@/lib/cosmos";
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

// Mirrors reminder.ts's own ReminderIntervalType - see its comment for
// why "permanent" exists and is only ever used for the DVLA tax/SORN check.
export type CarReminderIntervalType = "mileage" | "months" | "date" | "permanent";

export interface CarReminderTrigger {
  intervalType: CarReminderIntervalType;
  intervalValue?: number;
  exactDate?: string;
}

export interface CarReminderDoc extends TrackerDocBase {
  type: "carReminder";
  carId: string;
  name: string;
  intervalType: CarReminderIntervalType;
  intervalValue?: number;
  baseMileage?: number;
  exactDate?: string;
  sourceKey?: string;
  notifiedAt?: string | null;
  // Mirrors reminder.ts's own fields of the same name exactly - see its
  // comment. Independent from notifiedAt (Pro-only email gate); these
  // gate the in-app bell notification instead, available to every account.
  dueSoonBellNotifiedAt?: string | null;
  overdueBellNotifiedAt?: string | null;
  additionalTriggers?: CarReminderTrigger[];
}

export async function createCarReminder(
  email: string,
  data: {
    carId: string;
    name: string;
    intervalType: CarReminderIntervalType;
    intervalValue?: number;
    baseMileage?: number;
    exactDate?: string;
    date: string;
    sourceKey?: string;
    additionalTriggers?: CarReminderTrigger[];
  }
): Promise<CarReminderDoc> {
  return createTrackerDoc<CarReminderDoc>(email, "carReminder", "carReminder", {
    ...data,
    notifiedAt: null,
    dueSoonBellNotifiedAt: null,
    overdueBellNotifiedAt: null,
  });
}

export async function getCarReminders(email: string, carId: string): Promise<CarReminderDoc[]> {
  return queryCarTrackerDocs<CarReminderDoc>(email, "carReminder", carId);
}

// Point-read by id - see reminder.ts's getReminderById for why.
export async function getCarReminderById(email: string, id: string): Promise<CarReminderDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<CarReminderDoc>();
  return resource ?? null;
}

export async function updateCarReminder(
  email: string,
  id: string,
  data: Partial<Omit<CarReminderDoc, "id" | "pk" | "type" | "createdAt">>
): Promise<CarReminderDoc | null> {
  return updateTrackerDoc<CarReminderDoc>(email, id, {
    ...data,
    notifiedAt: null,
    dueSoonBellNotifiedAt: null,
    overdueBellNotifiedAt: null,
  });
}

export async function deleteCarReminder(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}

export async function deleteCarRemindersBySourceKey(email: string, carId: string, sourceKey: string): Promise<void> {
  const container = getContainer();
  const existing = await queryCarTrackerDocs<CarReminderDoc>(email, "carReminder", carId);
  const toDelete = existing.filter((r) => r.sourceKey === sourceKey);
  for (const r of toDelete) {
    await container.item(r.id, email).delete();
  }
}

// Cross-partition, same accepted exception as getAllReminders - only
// ever called by the once-a-day cron.
export async function getAllCarReminders(): Promise<CarReminderDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<CarReminderDoc>({ query: "SELECT * FROM c WHERE c.type = 'carReminder'" })
    .fetchAll();
  return resources;
}

export async function markCarReminderNotified(email: string, id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<CarReminderDoc>();
  if (!resource) return;
  resource.notifiedAt = new Date().toISOString();
  await container.items.upsert(resource);
}

export async function markCarReminderDueSoonBellNotified(email: string, id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<CarReminderDoc>();
  if (!resource) return;
  resource.dueSoonBellNotifiedAt = new Date().toISOString();
  await container.items.upsert(resource);
}

export async function markCarReminderOverdueBellNotified(email: string, id: string): Promise<void> {
  const container = getContainer();
  const { resource } = await container.item(id, email).read<CarReminderDoc>();
  if (!resource) return;
  resource.overdueBellNotifiedAt = new Date().toISOString();
  await container.items.upsert(resource);
}

// Mirrors reminder.ts's syncSornReminder exactly - see its own comment.
export const CAR_SORN_REMINDER_SOURCE_KEY = "vdg-tax-status";
export const CAR_SORN_REMINDER_NAME = "Vehicle is SORN (not taxed)";
export const CAR_TAX_DUE_REMINDER_SOURCE_KEY = "vdg-tax-due-date";
export const CAR_TAX_DUE_REMINDER_NAME = "Road tax renewal due";

export async function syncCarSornReminder(
  email: string,
  carId: string,
  taxStatus: string | null,
  taxDueDate?: string | null
): Promise<void> {
  const isSorn = taxStatus?.trim().toUpperCase() === "SORN";
  const existing = await getCarReminders(email, carId);
  const currentSorn = existing.find((r) => r.sourceKey === CAR_SORN_REMINDER_SOURCE_KEY);
  const currentTaxDue = existing.find((r) => r.sourceKey === CAR_TAX_DUE_REMINDER_SOURCE_KEY);

  if (isSorn) {
    if (!currentSorn) {
      await createCarReminder(email, {
        carId,
        name: CAR_SORN_REMINDER_NAME,
        intervalType: "permanent",
        date: new Date().toISOString().slice(0, 10),
        sourceKey: CAR_SORN_REMINDER_SOURCE_KEY,
      });
    }
    if (currentTaxDue) {
      await deleteCarRemindersBySourceKey(email, carId, CAR_TAX_DUE_REMINDER_SOURCE_KEY);
    }
    return;
  }

  if (currentSorn) {
    await deleteCarRemindersBySourceKey(email, carId, CAR_SORN_REMINDER_SOURCE_KEY);
  }

  if (taxDueDate) {
    await deleteCarRemindersBySourceKey(email, carId, CAR_TAX_DUE_REMINDER_SOURCE_KEY);
    await createCarReminder(email, {
      carId,
      name: CAR_TAX_DUE_REMINDER_NAME,
      intervalType: "date",
      exactDate: taxDueDate,
      date: new Date().toISOString().slice(0, 10),
      sourceKey: CAR_TAX_DUE_REMINDER_SOURCE_KEY,
    });
  } else if (currentTaxDue) {
    await deleteCarRemindersBySourceKey(email, carId, CAR_TAX_DUE_REMINDER_SOURCE_KEY);
  }
}
