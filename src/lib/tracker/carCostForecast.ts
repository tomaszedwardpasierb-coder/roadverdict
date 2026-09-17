// Place at: src/lib/tracker/carCostForecast.ts
// Car equivalent of costForecast.ts - see that file's own comment for
// the full reasoning behind the three forecasting methods. Mirrored,
// not shared, same sister-schema convention as every other bike/car pair
// in this app. BILL_REMINDER_DEFAULTS is reused directly from
// billTypes.ts, not duplicated - "insurance"/"road-tax"/"mot-test" are
// shared, generic bill-type keys used by both vehicle kinds alike (see
// CAR_BILL_LABELS extending BILL_LABELS in carBillTypes.ts), there's
// never been a car-specific version of this one constant.
import { CAR_JOB_REMINDER_DEFAULTS, CAR_JOB_LABELS, isBenchmarkedCarJob } from "./carJobTypes";
import { getCarBenchmark, type CarBenchmarkClass } from "@/lib/carPriceData";
import { BILL_REMINDER_DEFAULTS } from "./billTypes";
import { computeCarTriggerDueValue } from "./carReminderStatus";
import { projectFutureMileage, type BikeLifetime, type MileagePoint } from "./mileageEstimate";
import { monthKey, monthLabel } from "./summary";
import type { CarReminderDoc, CarReminderTrigger } from "./carReminder";
import type { CarServiceRecordDoc } from "./carServiceRecord";
import type { CarModDoc } from "./carMod";
import type { CarBillDoc } from "./carBill";
import type { CarLabourDoc } from "./carLabour";
import { type ForecastWindow, FORECAST_WINDOW_MONTHS, type ForecastMonthPoint, type CategoryForecast } from "./costForecast";

export type { ForecastWindow, ForecastMonthPoint, CategoryForecast };
export { FORECAST_WINDOW_MONTHS, FORECAST_WINDOW_LABELS, pickCategoryForecast } from "./costForecast";

function futureMonthKeys(windowMonths: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 1; i <= windowMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    keys.push(monthKey(d.toISOString()));
  }
  return keys;
}

function emptyPoints(windowMonths: number): ForecastMonthPoint[] {
  return futureMonthKeys(windowMonths).map((k) => ({ month: monthLabel(k), total: 0 }));
}

function averageDailyRate(items: { date: string; cost: number }[], lookbackMonths: number): number {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const inWindow = items.filter((i) => new Date(i.date) >= cutoff);
  if (inWindow.length === 0) return 0;
  const total = inWindow.reduce((sum, i) => sum + i.cost, 0);
  const oldestDate = inWindow.reduce((min, i) => (new Date(i.date) < min ? new Date(i.date) : min), new Date());
  const daysSpanned = Math.max(1, (Date.now() - oldestDate.getTime()) / 86400000);
  return total / daysSpanned;
}

function formatGbp(n: number): string {
  return `£${n.toLocaleString("en-GB")}`;
}

function buildAverageForecast(
  items: { date: string; cost: number }[],
  windowMonths: number,
  categoryLabel: string
): CategoryForecast {
  const ratePerDay = averageDailyRate(items, windowMonths);
  if (ratePerDay === 0) {
    return { points: emptyPoints(windowMonths), basis: `No ${categoryLabel.toLowerCase()} spend logged yet to base an estimate on.` };
  }
  const daysPerMonth = 30.44;
  const monthlyAmount = ratePerDay * daysPerMonth;
  const points = futureMonthKeys(windowMonths).map((k) => ({ month: monthLabel(k), total: Math.round(monthlyAmount) }));
  const monthlyRounded = Math.round(monthlyAmount);
  return {
    points,
    basis: `A steady ${formatGbp(monthlyRounded)}/month, based on your average ${categoryLabel.toLowerCase()} spend over the last ${windowMonths} month${windowMonths === 1 ? "" : "s"}.`,
  };
}

function ownAverageByKey<T extends { cost: number }>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const item of items) {
    const key = keyFn(item);
    const entry = sums.get(key) ?? { total: 0, count: 0 };
    entry.total += item.cost;
    entry.count += 1;
    sums.set(key, entry);
  }
  const averages = new Map<string, number>();
  for (const [key, { total, count }] of sums) averages.set(key, total / count);
  return averages;
}

function addToMonth(buckets: Map<string, number>, monthKeyStr: string, amount: number) {
  buckets.set(monthKeyStr, (buckets.get(monthKeyStr) ?? 0) + amount);
}

// See costForecast.ts's own bucketKeyForDate for why this clamp exists -
// a due date can legitimately fall later in the CURRENT calendar month,
// which futureMonthKeys never enumerates on its own.
function bucketKeyForDate(date: Date, windowMonths: number): string {
  const key = monthKey(date.toISOString());
  const validKeys = futureMonthKeys(windowMonths);
  return validKeys.includes(key) ? key : validKeys[0];
}

interface DueItem {
  jobType: string;
  dueDate: Date;
}

function resolveTriggerDueDate(
  t: CarReminderTrigger,
  r: CarReminderDoc,
  currentMileage: number,
  mileagePoints: MileagePoint[],
  carLifetime: BikeLifetime
): Date | null {
  const due = computeCarTriggerDueValue(t, r);
  if (!due || due.type === "permanent") return null;
  if (due.dueDate) return new Date(due.dueDate);
  if (due.dueMileage != null) {
    if (due.dueMileage <= currentMileage) return new Date();
    const milesNeeded = due.dueMileage - currentMileage;
    const projectedIn30Days = projectFutureMileage(new Date(Date.now() + 30 * 86400000).toISOString(), mileagePoints, carLifetime);
    const ratePerDay = Math.max(0.1, (projectedIn30Days - currentMileage) / 30);
    const daysAhead = milesNeeded / ratePerDay;
    return new Date(Date.now() + daysAhead * 86400000);
  }
  return null;
}

export function buildCarServicingForecast(input: {
  records: CarServiceRecordDoc[];
  reminders: CarReminderDoc[];
  currentMileage: number;
  mileagePoints: MileagePoint[];
  carLifetime: BikeLifetime;
  carClass: CarBenchmarkClass;
  window: ForecastWindow;
}): CategoryForecast {
  const windowMonths = FORECAST_WINDOW_MONTHS[input.window];
  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + windowMonths);

  const ownAverages = ownAverageByKey(input.records, (r) => r.jobType);
  const dueItems: DueItem[] = [];
  const coveredJobTypes = new Set<string>();

  for (const reminder of input.reminders) {
    const jobType = reminder.sourceKey?.startsWith("service:") ? reminder.sourceKey.slice("service:".length) : null;
    if (!jobType) continue;
    coveredJobTypes.add(jobType);
    const triggers: CarReminderTrigger[] = [
      { intervalType: reminder.intervalType, intervalValue: reminder.intervalValue, exactDate: reminder.exactDate },
      ...(reminder.additionalTriggers ?? []),
    ];
    let soonest: Date | null = null;
    for (const t of triggers) {
      const due = resolveTriggerDueDate(t, reminder, input.currentMileage, input.mileagePoints, input.carLifetime);
      if (due && (!soonest || due < soonest)) soonest = due;
    }
    if (soonest && soonest <= windowEnd) dueItems.push({ jobType, dueDate: soonest });
  }

  const latestByType = new Map<string, CarServiceRecordDoc>();
  for (const r of input.records) {
    const existing = latestByType.get(r.jobType);
    if (!existing || r.mileage > existing.mileage) latestByType.set(r.jobType, r);
  }
  for (const [jobType, last] of latestByType) {
    if (coveredJobTypes.has(jobType)) continue;
    const def = CAR_JOB_REMINDER_DEFAULTS[jobType];
    if (!def) continue;
    const pseudoReminder: CarReminderDoc = {
      id: "", pk: "", type: "carReminder", carId: "", date: last.date, createdAt: last.date, name: "",
      intervalType: def.type, intervalValue: def.value, baseMileage: last.mileage,
    };
    const trigger: CarReminderTrigger = { intervalType: def.type, intervalValue: def.value };
    const due = resolveTriggerDueDate(trigger, pseudoReminder, input.currentMileage, input.mileagePoints, input.carLifetime);
    if (due && due <= windowEnd) dueItems.push({ jobType, dueDate: due });
  }

  const buckets = new Map<string, number>();
  const pricedLabels: string[] = [];
  let unpricedCount = 0;
  for (const item of dueItems) {
    const key = bucketKeyForDate(item.dueDate, windowMonths);
    const ownAverage = ownAverages.get(item.jobType);
    const cost =
      ownAverage ??
      (isBenchmarkedCarJob(item.jobType)
        ? (getCarBenchmark(item.jobType, input.carClass).low + getCarBenchmark(item.jobType, input.carClass).high) / 2
        : null);
    if (cost == null) {
      unpricedCount++;
      continue;
    }
    addToMonth(buckets, key, cost);
    pricedLabels.push(CAR_JOB_LABELS[item.jobType] ?? item.jobType);
  }

  const points = futureMonthKeys(windowMonths).map((k) => ({ month: monthLabel(k), total: Math.round(buckets.get(k) ?? 0) }));
  const basis =
    pricedLabels.length === 0 && unpricedCount === 0
      ? "Nothing due yet, based on your reminders and usual service intervals for this window."
      : pricedLabels.length === 0
      ? `${unpricedCount} item${unpricedCount === 1 ? " is" : "s are"} due in this window, but there's no cost history or estimate available yet for ${unpricedCount === 1 ? "it" : "them"}.`
      : `Based on what's due in this window (${[...new Set(pricedLabels)].join(", ")}), costed from your own history where logged, otherwise a sourced UK estimate.${
          unpricedCount > 0 ? ` ${unpricedCount} more item${unpricedCount === 1 ? " is" : "s are"} due but not shown - no cost history or estimate available yet.` : ""
        }`;
  return { points, basis };
}

export function buildCarModsForecast(mods: CarModDoc[], window: ForecastWindow): CategoryForecast {
  return buildAverageForecast(mods, FORECAST_WINDOW_MONTHS[window], "Parts & accessories");
}

export function buildCarLabourForecast(labour: CarLabourDoc[], window: ForecastWindow): CategoryForecast {
  return buildAverageForecast(labour, FORECAST_WINDOW_MONTHS[window], "Labour");
}

const KNOWN_DATE_BILL_TYPES = new Set(["road-tax", "insurance", "mot-test"]);

export function buildCarBillsForecast(input: { bills: CarBillDoc[]; reminders: CarReminderDoc[]; window: ForecastWindow }): CategoryForecast {
  const windowMonths = FORECAST_WINDOW_MONTHS[input.window];
  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + windowMonths);
  const buckets = new Map<string, number>();
  const lumpLabels: string[] = [];

  for (const billType of KNOWN_DATE_BILL_TYPES) {
    const matching = input.bills.filter((b) => b.billType === billType).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const latest = matching[0];
    if (!latest) continue;
    const hasReminder = input.reminders.some((r) => r.sourceKey === `bill:${billType}`);
    if (billType !== "road-tax" && !hasReminder) continue;
    const def = BILL_REMINDER_DEFAULTS[billType];
    const due = new Date(latest.date);
    due.setMonth(due.getMonth() + def.value);
    if (due <= windowEnd && due >= new Date()) {
      addToMonth(buckets, bucketKeyForDate(due, windowMonths), latest.cost);
      lumpLabels.push(billType);
    }
  }

  const baselineItems = input.bills.filter((b) => !(KNOWN_DATE_BILL_TYPES.has(b.billType) && lumpLabels.includes(b.billType)));
  const baseline = buildAverageForecast(baselineItems, windowMonths, "other bills");
  baseline.points.forEach((p, i) => {
    const key = futureMonthKeys(windowMonths)[i];
    addToMonth(buckets, key, p.total);
  });

  const points = futureMonthKeys(windowMonths).map((k) => ({ month: monthLabel(k), total: Math.round(buckets.get(k) ?? 0) }));
  const basisParts: string[] = [];
  if (lumpLabels.length > 0) basisParts.push(`known renewals (${lumpLabels.join(", ")}) at last year's cost`);
  if (baseline.points.some((p) => p.total > 0)) basisParts.push("a steady average for everything else");
  const basis = basisParts.length > 0 ? `Based on ${basisParts.join(", plus ")}.` : "No bills logged yet to base an estimate on.";
  return { points, basis };
}

export interface CarCostForecast {
  servicing: CategoryForecast;
  mods: CategoryForecast;
  bills: CategoryForecast;
  labour: CategoryForecast;
}

export function buildCarCostForecast(input: {
  records: CarServiceRecordDoc[];
  mods: CarModDoc[];
  bills: CarBillDoc[];
  labour: CarLabourDoc[];
  reminders: CarReminderDoc[];
  currentMileage: number;
  mileagePoints: MileagePoint[];
  carLifetime: BikeLifetime;
  carClass: CarBenchmarkClass;
  window: ForecastWindow;
}): CarCostForecast {
  return {
    servicing: buildCarServicingForecast(input),
    mods: buildCarModsForecast(input.mods, input.window),
    bills: buildCarBillsForecast({ bills: input.bills, reminders: input.reminders, window: input.window }),
    labour: buildCarLabourForecast(input.labour, input.window),
  };
}

const ALL_FORECAST_WINDOWS: ForecastWindow[] = ["3m", "6m", "1y"];

// See buildBikeCostForecastAllWindows's own comment in costForecast.ts
// for why this computes all three windows up front rather than one.
export function buildCarCostForecastAllWindows(
  input: Omit<Parameters<typeof buildCarCostForecast>[0], "window">
): Record<ForecastWindow, CarCostForecast> {
  return Object.fromEntries(ALL_FORECAST_WINDOWS.map((window) => [window, buildCarCostForecast({ ...input, window })])) as Record<
    ForecastWindow,
    CarCostForecast
  >;
}
