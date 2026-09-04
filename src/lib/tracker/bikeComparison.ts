// Place at: src/lib/tracker/bikeComparison.ts
//
// One bike's worth of comparison metrics - see the garage compare page
// for how these get rendered side by side. Every value here is stored
// (or already computed) in its canonical unit - GBP, miles - never in
// whatever currency/distanceUnit that particular bike happens to display
// in day to day. Converting to a single shared display unit for the
// comparison table is the RENDERING layer's job, not this one's, exactly
// the same split the rest of the app already uses between stored and
// displayed units.
import { getBike, isBikeReadOnly } from "./bike";
import { getServiceRecords } from "./serviceRecord";
import { getFuelLogs, computeActualMPG } from "./fuelLog";
import { getMods } from "./mod";
import { getBills } from "./bill";
import { materializeAllDueForBike } from "./billSeries";
import { computeSpendSummary, computeYearSpend, type SpendSummary } from "./summary";
import { getSellerReportCore } from "./sellerReportData";
import { monthsBetween } from "./reminderStatus";

export interface BikeComparisonEntry {
  bikeId: string;
  name: string;
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  // Miles actually ridden under this owner - currentMileage minus
  // startingMileage, NOT the raw odometer reading. A bike bought with
  // 20,000 miles already on the clock would otherwise look artificially
  // cheap per mile.
  milesRidden: number;
  ownedSince: string;
  monthsOwned: number;
  milesPerMonth: number | null;
  spend: SpendSummary;
  yearSpend: number;
  // Real spend (servicing + mods + bills + fuel) divided by milesRidden -
  // null when milesRidden is 0, rather than a divide-by-zero Infinity.
  costPerMile: number | null;
  actualMpg: number | null;
  serviceCount: number;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
  nextDue: { name: string; status: "due-soon" | "overdue" } | null;
  // Reuses evidenceQuality.receiptCoveragePct, already computed by the
  // buyer-report pipeline - not a second, separately-derived score.
  documentationPct: number;
}

export async function buildBikeComparisonEntry(email: string, bikeId: string): Promise<BikeComparisonEntry | null> {
  const bike = await getBike(email, bikeId);
  if (!bike) return null;

  // Same materialisation call, same read-only guard, as the dashboard/
  // buyer-report/CSV-export call sites - an active instalment plan's
  // cost should be current here too.
  if (!isBikeReadOnly(bike)) {
    await materializeAllDueForBike(email, bikeId);
  }

  const [records, fuelLogs, mods, bills, core] = await Promise.all([
    getServiceRecords(email, bikeId),
    getFuelLogs(email, bikeId),
    getMods(email, bikeId),
    getBills(email, bikeId),
    getSellerReportCore(email, bikeId),
  ]);

  const spend = computeSpendSummary(records, mods, fuelLogs, bills);
  const yearSpend = computeYearSpend(records, mods, fuelLogs, bills, new Date().getFullYear());
  const milesRidden = Math.max(bike.currentMileage - bike.startingMileage, 0);
  const monthsOwned = Math.max(monthsBetween(new Date(bike.dateAdded), new Date()), 0);
  const milesPerMonth = monthsOwned > 0 ? milesRidden / monthsOwned : null;
  const costPerMile = milesRidden > 0 ? spend.grandTotal / milesRidden : null;
  const actualMpg = computeActualMPG(fuelLogs, bike.dvlaData?.officialCombinedMpg);

  const lastService = [...records].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
  const soonestDue = core.upcomingReminders[0];

  return {
    bikeId,
    name: bike.nickname ? `${bike.nickname} - ${bike.make} ${bike.model}` : `${bike.make} ${bike.model}`,
    year: bike.year,
    isCustomBuild: bike.isCustomBuild,
    currentMileage: bike.currentMileage,
    milesRidden,
    ownedSince: bike.dateAdded,
    monthsOwned,
    milesPerMonth,
    spend,
    yearSpend,
    costPerMile,
    actualMpg,
    serviceCount: records.length,
    lastServiceDate: lastService?.date ?? null,
    lastServiceMileage: lastService?.mileage ?? null,
    nextDue: soonestDue ? { name: soonestDue.reminder.name, status: soonestDue.status } : null,
    documentationPct: core.evidenceQuality.receiptCoveragePct,
  };
}

// Fetches every bike in parallel - "call each twice" (once per bike),
// never a batch/cross-partition query, since these are always the
// caller's own bikes within their own partition. Silently drops any id
// that didn't resolve to a real bike, rather than failing the whole
// comparison - the caller decides whether the remaining count is still
// enough to show.
export async function buildBikeComparison(email: string, bikeIds: string[]): Promise<BikeComparisonEntry[]> {
  const entries = await Promise.all(bikeIds.map((id) => buildBikeComparisonEntry(email, id)));
  return entries.filter((e): e is BikeComparisonEntry => e !== null);
}
