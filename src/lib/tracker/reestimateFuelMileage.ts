// Place at: src/lib/tracker/reestimateFuelMileage.ts
//
// Runs after a new trusted mileage anchor appears anywhere on a bike -
// refines any fuel logs still carrying an AI mileage guess, using the
// now-denser set of real anchors. Never touches a fuel log whose
// mileage is already "confirmed" (read directly off a receipt, typed
// in by hand, or explicitly kept as-is via the conflict modal) - those
// are real numbers, not guesses waiting to be improved.
import { getServiceRecords } from "./serviceRecord";
import { getMods } from "./mod";
import { getFuelLogs, updateFuelLog } from "./fuelLog";
import { getBills } from "./bill";
import { estimateMileage, type MileagePoint } from "./mileageEstimate";
import type { BikeDoc } from "./bike";

export async function reestimateFuelMileage(email: string, bike: BikeDoc): Promise<{ updatedCount: number }> {
  const [records, mods, fuelLogs, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
    getBills(email, bike.id),
  ]);

  // Only genuinely trusted points feed a re-estimate. Services and mods
  // have no confidence concept at all - they're always real, directly-
  // entered facts. MOT-derived bills are DVSA-verified (and, as of
  // today's fix, already cross-checked against each other for internal
  // sequence consistency). Fuel logs are the one category that can
  // itself be an estimate, so only the confirmed ones count here -
  // undefined is treated as trusted too, matching the exact same
  // convention mpgCalc.ts already uses for "not flagged as uncertain".
  const trustedPoints: MileagePoint[] = [
    ...records.map((r) => ({ date: r.date, mileage: r.mileage })),
    ...mods.map((m) => ({ date: m.date, mileage: m.mileage })),
    ...fuelLogs
      .filter((f) => f.mileageConfidence !== "estimated" && f.mileageConfidence !== "interpolated")
      .map((f) => ({ date: f.date, mileage: f.mileage })),
    ...bills
      .filter((b) => b.billType === "mot-test" && b.mileage != null)
      .map((b) => ({ date: b.date, mileage: b.mileage as number })),
  ];

  const candidates = fuelLogs.filter(
    (f) => f.mileageConfidence === "estimated" || f.mileageConfidence === "interpolated"
  );

  const bikeLifetime = {
    startingMileage: bike.startingMileage,
    currentMileage: bike.currentMileage,
    dateAdded: bike.dateAdded,
  };

  let updatedCount = 0;
  for (const log of candidates) {
    const result = estimateMileage(log.date, trustedPoints, bikeLifetime);

    // A result that itself says "ask a human" must never get auto-
    // applied - that signal exists specifically so a shaky guess isn't
    // silently written as if it were confident. Leaving the existing
    // (also imperfect) stored value in place is safer than replacing it
    // with an equally uncertain new one under a different label.
    if (result.requiresManualEntry) continue;
    if (result.mileage === log.mileage) continue;

    await updateFuelLog(email, log.id, {
      litres: log.litres,
      cost: log.cost,
      mileage: result.mileage,
      date: log.date,
      filledToFull: log.filledToFull,
      mileageConfidence: result.confidence,
      mileageConflictWarning: result.warning ?? null,
    });
    updatedCount++;
  }

  return { updatedCount };
}
