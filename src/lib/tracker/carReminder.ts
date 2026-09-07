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

export interface CarReminderTrigger {
  intervalType: "mileage" | "months" | "date";
  intervalValue?: number;
  exactDate?: string;
}

export interface CarReminderDoc extends TrackerDocBase {
  type: "carReminder";
  carId: string;
  name: string;
  intervalType: "mileage" | "months" | "date";
  intervalValue?: number;
  baseMileage?: number;
  exactDate?: string;
  sourceKey?: string;
  notifiedAt?: string | null;
  additionalTriggers?: CarReminderTrigger[];
}

export async function createCarReminder(
  email: string,
  data: {
    carId: string;
    name: string;
    intervalType: "mileage" | "months" | "date";
    intervalValue?: number;
    baseMileage?: number;
    exactDate?: string;
    date: string;
    sourceKey?: string;
    additionalTriggers?: CarReminderTrigger[];
  }
): Promise<CarReminderDoc> {
  return createTrackerDoc<CarReminderDoc>(email, "carReminder", "carReminder", { ...data, notifiedAt: null });
}

export async function getCarReminders(email: string, carId: string): Promise<CarReminderDoc[]> {
  return queryCarTrackerDocs<CarReminderDoc>(email, "carReminder", carId);
}

export async function updateCarReminder(
  email: string,
  id: string,
  data: Partial<Omit<CarReminderDoc, "id" | "pk" | "type" | "createdAt">>
): Promise<CarReminderDoc | null> {
  return updateTrackerDoc<CarReminderDoc>(email, id, { ...data, notifiedAt: null });
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
