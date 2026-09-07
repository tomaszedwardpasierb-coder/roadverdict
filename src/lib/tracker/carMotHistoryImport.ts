// Place at: src/lib/tracker/carMotHistoryImport.ts
//
// Car equivalent of motHistoryImport.ts - fetch, dedupe against what's
// already logged, create bill entries + a reminder. fetchMotHistoryFromVdg,
// motReminderDate, and isBeforeProduction are all already vehicle-agnostic
// (VRM/date-string/ProductionYearCheckable-only, no BikeDoc coupling), so
// they're reused directly rather than duplicated - only the bill/reminder/
// fuel-mileage calls below are genuinely car-specific.
import type { CarDoc } from "./car";
import { fetchMotHistoryFromVdg } from "./motHistoryFetch";
import { createCarBill, getCarBills } from "./carBill";
import { createCarReminder, deleteCarRemindersBySourceKey } from "./carReminder";
import { isBeforeProduction } from "./productionYearCheck";
import { motReminderDate } from "./motHistory";
import { reestimateCarFuelMileage } from "./reestimateCarFuelMileage";

export interface CarMotImportResult {
  createdCount: number;
  skippedCount: number;
  skipped: { date: string; reason: string }[];
  motDueDate: string | null;
  reminderSet: boolean;
}

export async function importMotHistoryForCar(
  email: string,
  car: CarDoc,
  vrm: string
): Promise<CarMotImportResult | { error: string; status: number }> {
  const parsed = await fetchMotHistoryFromVdg(vrm);
  if (!parsed) {
    return {
      error: "No MOT history found - this vehicle may be MOT-exempt (under 3 years old) or not yet tested.",
      status: 404,
    };
  }

  const existingBills = await getCarBills(email, car.id);
  const alreadyLoggedDates = new Set(
    existingBills.filter((b) => b.billType === "mot-test").map((b) => b.date.slice(0, 10))
  );

  const created: { date: string; passed: boolean }[] = [];
  const skipped: { date: string; reason: string }[] = [];

  for (const test of parsed.tests) {
    const day = test.testDate.slice(0, 10);
    if (alreadyLoggedDates.has(day)) {
      skipped.push({ date: day, reason: "Already logged." });
      continue;
    }
    if (isBeforeProduction(test.testDate, car)) {
      skipped.push({ date: day, reason: "Before this car's production year - skipped as implausible." });
      continue;
    }
    await createCarBill(email, {
      carId: car.id,
      billType: "mot-test",
      cost: 0,
      date: test.testDate,
      notes: test.notes,
      mileage: test.mileage ?? undefined,
    });
    created.push({ date: day, passed: test.passed });
  }

  let reminderSet = false;
  if (parsed.motDueDate) {
    const sourceKey = "bill:mot-test";
    const latestTestDate =
      parsed.tests.length > 0 ? parsed.tests[parsed.tests.length - 1].testDate : new Date().toISOString();
    await deleteCarRemindersBySourceKey(email, car.id, sourceKey);
    await createCarReminder(email, {
      carId: car.id,
      name: "MOT renewal",
      intervalType: "date",
      exactDate: motReminderDate(parsed.motDueDate),
      date: latestTestDate,
      sourceKey,
    });
    reminderSet = true;
  }

  // Best-effort, non-blocking - same reasoning as the motorcycle version:
  // a failure here should never undo an otherwise-successful MOT import.
  if (created.length > 0) {
    try {
      await reestimateCarFuelMileage(email, car);
    } catch (err) {
      console.error("Fuel mileage re-estimation after car MOT import failed:", err);
    }
  }

  return {
    createdCount: created.length,
    skippedCount: skipped.length,
    skipped,
    motDueDate: parsed.motDueDate,
    reminderSet,
  };
}
