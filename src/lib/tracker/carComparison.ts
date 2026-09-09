// Place at: src/lib/tracker/carComparison.ts
//
// Car equivalent of bikeComparison.ts - mirrored, not shared, same
// sister-schema convention as every other bike/car pair in this app.
// One real, deliberate gap versus the bike version: no getSellerReportCore
// call (cars have no equivalent yet - see the ADR's "sell with proof"
// chain, still unbuilt), so nextDue and documentationPct are always
// null here - the comparison table shows "Not available yet" for a car
// in those two columns rather than a real value.
import { getCarById } from "./car";
import { getCarServiceRecords } from "./carServiceRecord";
import { getCarFuelLogs } from "./carFuelLog";
import { getCarMods } from "./carMod";
import { getCarBills } from "./carBill";
import { computeCarSpendSummary, computeCarYearSpend, gatherCarMileagePoints } from "./carSummary";
import { computeMPGSeries as computeCarMpgSeries } from "./mpgCalc";
import { monthsBetween } from "./reminderStatus";
import { isDateInRange, mileageAsOf, type ComparisonPeriod } from "./bikeComparisonPeriod";
import type { VehicleComparisonEntry } from "./vehicleComparison";

export async function buildCarComparisonEntry(
  email: string,
  carId: string,
  period?: ComparisonPeriod
): Promise<VehicleComparisonEntry | null> {
  const car = await getCarById(email, carId);
  if (!car) return null;

  const [records, fuelLogs, mods, bills] = await Promise.all([
    getCarServiceRecords(email, carId),
    getCarFuelLogs(email, carId),
    getCarMods(email, carId),
    getCarBills(email, carId),
  ]);

  const recordsInPeriod = records.filter((r) => isDateInRange(r.date, period));
  const fuelLogsInPeriod = fuelLogs.filter((f) => isDateInRange(f.date, period));
  const modsInPeriod = mods.filter((m) => isDateInRange(m.date, period));
  const billsInPeriod = bills.filter((b) => isDateInRange(b.date, period));

  const spend = computeCarSpendSummary(recordsInPeriod, modsInPeriod, fuelLogsInPeriod, billsInPeriod);
  const yearSpend = period ? null : computeCarYearSpend(records, mods, fuelLogs, bills, new Date().getFullYear());

  const mileagePoints = gatherCarMileagePoints(records, mods, fuelLogs, bills);
  const mileageAtStart = mileageAsOf(mileagePoints, period?.from, car.startingMileage);
  const mileageAtEnd = period?.to ? mileageAsOf(mileagePoints, period.to, car.currentMileage) : car.currentMileage;
  const milesRidden = Math.max(mileageAtEnd - mileageAtStart, 0);

  const periodStart = period?.from ?? car.dateAdded;
  const periodEnd = period?.to ?? new Date().toISOString().slice(0, 10);
  const monthsOwned = Math.max(monthsBetween(new Date(periodStart), new Date(periodEnd)), 0);
  const milesPerMonth = monthsOwned > 0 ? milesRidden / monthsOwned : null;
  const costPerMile = milesRidden > 0 ? spend.grandTotal / milesRidden : null;

  // Same electric-filtering reasoning as the dashboard's own Reports tab
  // (renderCarDashboard) - a charging-only entry has no litres reading
  // to feed the MPG calc at all.
  const mpgCalcFuelLogs = fuelLogs
    .filter((f): f is typeof f & { litres: number } => f.litres != null)
    .map((f) => ({
      id: f.id, mileage: f.mileage, litres: f.litres, filledToFull: f.filledToFull ?? false, date: f.date,
      mileageConfidence: f.mileageConfidence, mileageAnomaly: f.mileageAnomaly,
    }));
  const allSegments = computeCarMpgSeries(mpgCalcFuelLogs, car.dvlaData?.officialCombinedMpg).filter((s) => !s.likelyMissedFillUps);
  const segmentsInPeriod = allSegments.filter((s) => isDateInRange(s.date, period));
  const actualMpg = segmentsInPeriod.length > 0 ? segmentsInPeriod.reduce((sum, s) => sum + s.mpg, 0) / segmentsInPeriod.length : null;

  const lastService = [...recordsInPeriod].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;

  return {
    bikeId: carId,
    kind: "car",
    name: car.nickname ? `${car.nickname} - ${car.make} ${car.model}` : `${car.make} ${car.model}`,
    year: car.year,
    isCustomBuild: car.isCustomBuild,
    currentMileage: car.currentMileage,
    milesRidden,
    ownedSince: car.dateAdded,
    monthsOwned,
    milesPerMonth,
    spend,
    yearSpend,
    costPerMile,
    actualMpg,
    serviceCount: recordsInPeriod.length,
    lastServiceDate: lastService?.date ?? null,
    lastServiceMileage: lastService?.mileage ?? null,
    nextDue: null,
    documentationPct: null,
  };
}

// Fetches every car in parallel, same reasoning as buildBikeComparison -
// always the caller's own cars within their own partition, never a
// cross-partition query. Silently drops any id that didn't resolve to a
// real car, rather than failing the whole comparison.
export async function buildCarComparison(
  email: string,
  carIds: string[],
  period?: ComparisonPeriod
): Promise<VehicleComparisonEntry[]> {
  const entries = await Promise.all(carIds.map((id) => buildCarComparisonEntry(email, id, period)));
  return entries.filter((e): e is VehicleComparisonEntry => e !== null);
}
