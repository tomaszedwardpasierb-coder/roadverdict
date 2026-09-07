// Place at: src/lib/tracker/reestimateCarFuelMileage.ts
//
// Car equivalent of reestimateFuelMileage.ts - same logic file-for-file,
// against the Car* doc types instead. Never touches a fuel log whose
// mileage is already "confirmed" (read directly off a receipt, typed
// in by hand, or explicitly kept as-is via the conflict modal) - those
// are real numbers, not guesses waiting to be improved.
import { getCarServiceRecords } from "./carServiceRecord";
import { getCarMods } from "./carMod";
import { getCarFuelLogs, updateCarFuelLog } from "./carFuelLog";
import { getCarBills } from "./carBill";
import { estimateMileage, type MileagePoint } from "./mileageEstimate";
import type { CarDoc } from "./car";

export async function reestimateCarFuelMileage(email: string, car: CarDoc): Promise<{ updatedCount: number }> {
  const [records, mods, fuelLogs, bills] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarMods(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarBills(email, car.id),
  ]);

  // Only genuinely trusted points feed a re-estimate. Services and mods
  // have no confidence concept at all - they're always real, directly-
  // entered facts. MOT-derived bills are DVSA-verified. Fuel logs are
  // the one category that can itself be an estimate, so only the
  // confirmed ones count here - undefined is treated as trusted too,
  // matching the exact same convention mpgCalc.ts (and the motorcycle
  // version of this file) already uses for "not flagged as uncertain".
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

  const carLifetime = {
    startingMileage: car.startingMileage,
    currentMileage: car.currentMileage,
    dateAdded: car.dateAdded,
  };

  let updatedCount = 0;
  for (const log of candidates) {
    const result = estimateMileage(log.date, trustedPoints, carLifetime);

    // A result that itself says "ask a human" must never get auto-
    // applied - that signal exists specifically so a shaky guess isn't
    // silently written as if it were confident. Leaving the existing
    // (also imperfect) stored value in place is safer than replacing it
    // with an equally uncertain new one under a different label.
    if (result.requiresManualEntry) continue;
    if (result.mileage === log.mileage) continue;

    await updateCarFuelLog(email, log.id, {
      fuelType: log.fuelType,
      litres: log.litres,
      kwh: log.kwh,
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
