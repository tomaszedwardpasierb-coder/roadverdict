// Place at: src/lib/tracker/motHistoryImport.ts
//
// The actual "pull MOT history and log it" action - fetch, dedupe
// against what's already logged, create bill entries + a reminder.
// Shared by the normal user-facing route (which always uses the bike's
// own current registration) and the admin-only override route (which
// can target a specific VRM directly, for correcting cases where a
// bike's current plate in RoadVerdict isn't the plate DVSA has MOT test
// history under).
import type { BikeDoc } from "./bike";
import { fetchMotHistoryFromVdg } from "./motHistoryFetch";
import { createBill, getBills } from "./bill";
import { createReminder, deleteRemindersBySourceKey } from "./reminder";
import { isBeforeProduction } from "./productionYearCheck";
import { motReminderDate } from "./motHistory";
import { reestimateFuelMileage } from "./reestimateFuelMileage";

export interface MotImportResult {
  createdCount: number;
  skippedCount: number;
  skipped: { date: string; reason: string }[];
  motDueDate: string | null;
  reminderSet: boolean;
}

export async function importMotHistoryForBike(
  email: string,
  bike: BikeDoc,
  vrm: string
): Promise<MotImportResult | { error: string; status: number }> {
  const parsed = await fetchMotHistoryFromVdg(vrm);
  if (!parsed) {
    return {
      error: "No MOT history found - this vehicle may be MOT-exempt (under 3 years old) or not yet tested.",
      status: 404,
    };
  }

  const existingBills = await getBills(email, bike.id);
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
    if (isBeforeProduction(test.testDate, bike)) {
      skipped.push({ date: day, reason: "Before this bike's production year - skipped as implausible." });
      continue;
    }
    await createBill(email, {
      bikeId: bike.id,
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
    await deleteRemindersBySourceKey(email, bike.id, sourceKey);
    await createReminder(email, {
      bikeId: bike.id,
      name: "MOT renewal",
      intervalType: "date",
      exactDate: motReminderDate(parsed.motDueDate),
      date: latestTestDate,
      sourceKey,
    });
    reminderSet = true;
  }

  // Best-effort, non-blocking - new MOT anchors are exactly the case
  // that motivated this: a real, trusted odometer reading landing months
  // or years into an existing fuel-log timeline, right where several AI
  // guesses were the only thing available before. A failure here should
  // never undo an otherwise-successful MOT import.
  if (created.length > 0) {
    try {
      await reestimateFuelMileage(email, bike);
    } catch (err) {
      console.error("Fuel mileage re-estimation after MOT import failed:", err);
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
