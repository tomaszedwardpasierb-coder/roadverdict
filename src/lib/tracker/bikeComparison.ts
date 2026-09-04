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
import { getFuelLogs, computeMPGSeries } from "./fuelLog";
import { getMods } from "./mod";
import { getBills } from "./bill";
import { materializeAllDueForBike } from "./billSeries";
import { computeSpendSummary, computeYearSpend, gatherMileagePoints, type SpendSummary } from "./summary";
import { getSellerReportCore } from "./sellerReportData";
import { monthsBetween } from "./reminderStatus";
import { isDateInRange, mileageAsOf, type ComparisonPeriod } from "./bikeComparisonPeriod";

export interface BikeComparisonEntry {
  bikeId: string;
  name: string;
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  // Miles actually ridden under this owner over the period being shown -
  // currentMileage minus startingMileage when there's no filter, NOT the
  // raw odometer reading either way. A bike bought with 20,000 miles
  // already on the clock would otherwise look artificially cheap per
  // mile. With a date filter active, both ends are resolved via
  // mileageAsOf - see bikeComparisonPeriod.ts.
  milesRidden: number;
  ownedSince: string;
  monthsOwned: number;
  milesPerMonth: number | null;
  spend: SpendSummary;
  // Current-calendar-year spend - only meaningful, and only populated,
  // when no custom date filter is active. A specific period already IS
  // its own spend window, so showing "this year" alongside it would be
  // redundant at best and confusing at worst.
  yearSpend: number | null;
  // Real spend (servicing + mods + bills + fuel) divided by milesRidden -
  // null when milesRidden is 0, rather than a divide-by-zero Infinity.
  costPerMile: number | null;
  actualMpg: number | null;
  serviceCount: number;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
  // Always all-time regardless of any date filter - a period filter has
  // no meaning for something that's inherently about the future.
  nextDue: { name: string; status: "due-soon" | "overdue" } | null;
  // Reuses evidenceQuality.receiptCoveragePct, already computed by the
  // buyer-report pipeline - not a second, separately-derived score.
  // Always all-time too - documentation quality is a lifetime trust
  // signal, not something that makes sense scoped to a sub-period.
  documentationPct: number;
}

export async function buildBikeComparisonEntry(
  email: string,
  bikeId: string,
  period?: ComparisonPeriod
): Promise<BikeComparisonEntry | null> {
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

  const recordsInPeriod = records.filter((r) => isDateInRange(r.date, period));
  const fuelLogsInPeriod = fuelLogs.filter((f) => isDateInRange(f.date, period));
  const modsInPeriod = mods.filter((m) => isDateInRange(m.date, period));
  const billsInPeriod = bills.filter((b) => isDateInRange(b.date, period));

  const spend = computeSpendSummary(recordsInPeriod, modsInPeriod, fuelLogsInPeriod, billsInPeriod);
  const yearSpend = period ? null : computeYearSpend(records, mods, fuelLogs, bills, new Date().getFullYear());

  // Mileage boundaries are always resolved against the FULL, unfiltered
  // history (see mileageAsOf's own comment for why) - never the
  // period-filtered arrays above.
  const mileagePoints = gatherMileagePoints(records, mods, fuelLogs, bills);
  const mileageAtStart = mileageAsOf(mileagePoints, period?.from, bike.startingMileage);
  const mileageAtEnd = period?.to ? mileageAsOf(mileagePoints, period.to, bike.currentMileage) : bike.currentMileage;
  const milesRidden = Math.max(mileageAtEnd - mileageAtStart, 0);

  const periodStart = period?.from ?? bike.dateAdded;
  const periodEnd = period?.to ?? new Date().toISOString().slice(0, 10);
  const monthsOwned = Math.max(monthsBetween(new Date(periodStart), new Date(periodEnd)), 0);
  const milesPerMonth = monthsOwned > 0 ? milesRidden / monthsOwned : null;
  const costPerMile = milesRidden > 0 ? spend.grandTotal / milesRidden : null;

  // Run the chain-aware MPG calc across the FULL fuel log history first -
  // a period boundary shouldn't break a real fill-up chain that started
  // before it - then average only the segments whose own date falls
  // inside the period. Filtering the raw fuel logs before this step
  // would silently corrupt the gap/anomaly detection that depends on an
  // unbroken chain of fill-ups.
  const allSegments = computeMPGSeries(fuelLogs, bike.dvlaData?.officialCombinedMpg).filter((s) => !s.likelyMissedFillUps);
  const segmentsInPeriod = allSegments.filter((s) => isDateInRange(s.date, period));
  const actualMpg = segmentsInPeriod.length > 0 ? segmentsInPeriod.reduce((sum, s) => sum + s.mpg, 0) / segmentsInPeriod.length : null;

  const lastService = [...recordsInPeriod].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null;
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
    serviceCount: recordsInPeriod.length,
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
export async function buildBikeComparison(
  email: string,
  bikeIds: string[],
  period?: ComparisonPeriod
): Promise<BikeComparisonEntry[]> {
  const entries = await Promise.all(bikeIds.map((id) => buildBikeComparisonEntry(email, id, period)));
  return entries.filter((e): e is BikeComparisonEntry => e !== null);
}
