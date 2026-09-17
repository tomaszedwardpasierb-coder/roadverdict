// Place at: src/lib/tracker/costForecast.ts
//
// Powers the dashboard/reports "Forecast" view (ForecastToggle.tsx,
// CategorySpendChart.tsx) - always computed server-side in page.tsx from
// data already fetched for the real charts, never a separate API call,
// so switching between Past and Forecast is instant on the client.
//
// Three different methods, one per category, because the categories
// genuinely aren't the same kind of thing to predict:
//   - Servicing: event-based. Real reminders (and, for consumables with
//     no active reminder, the same JOB_REMINDER_DEFAULTS interval this
//     app already uses elsewhere) tell you WHEN something is actually
//     going to become due - so the forecast is lumpy on purpose,
//     reflecting real future events, not a smoothed guess.
//   - Mods, Labour: pure trailing-average, extrapolated flat. There is
//     no "due date" for an accessory purchase or ad-hoc workshop time -
//     nothing else is knowable, so this is the honest ceiling for these
//     two, not a simplification of something better.
//   - Bills: a hybrid of both. Road tax and (if a reminder exists)
//     insurance/MOT render as their own real lumps; anything else in the
//     category falls back to the same flat average baseline as
//     Mods/Labour.
//
// Every forecast carries its own `basis` string, shown in the UI next to
// the chart - a number with no visible reasoning behind it is exactly
// the kind of thing this app avoids everywhere else (see priceData.ts's
// own sourced-benchmark discipline), and a forecast is the last place to
// start being vague about where a figure came from.
import { JOB_REMINDER_DEFAULTS, JOB_LABELS, isBenchmarkedJob } from "./jobTypes";
import { getBenchmark, type BikeClass } from "@/lib/priceData";
import { BILL_REMINDER_DEFAULTS } from "./billTypes";
import { computeTriggerDueValue } from "./reminderStatus";
import { projectFutureMileage, type BikeLifetime, type MileagePoint } from "./mileageEstimate";
import { monthKey, monthLabel } from "./summary";
import type { ReminderDoc, ReminderTrigger } from "./reminder";
import type { ServiceRecordDoc } from "./serviceRecord";
import type { ModDoc } from "./mod";
import type { BillDoc } from "./bill";
import type { LabourDoc } from "./labour";

export type ForecastWindow = "3m" | "6m" | "1y";
export const FORECAST_WINDOW_MONTHS: Record<ForecastWindow, number> = { "3m": 3, "6m": 6, "1y": 12 };
export const FORECAST_WINDOW_LABELS: Record<ForecastWindow, string> = {
  "3m": "Next 3 months",
  "6m": "Next 6 months",
  "1y": "Next 12 months",
};

export interface ForecastMonthPoint {
  month: string; // same "MMM YY" format bucketByMonth's real points use
  total: number; // always in GBP - converted to the display currency by the chart, same as real data
}

export interface CategoryForecast {
  points: ForecastMonthPoint[];
  basis: string;
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

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

// Trailing average £/day over the last `lookbackMonths`, extrapolated as
// a flat line - deliberately not a rolling/seasonal model. "Very steady
// lines" is the point: a personal one-vehicle spend history doesn't
// carry enough signal to justify anything fancier, and a flat line is
// honest about that rather than implying more confidence than the data
// supports.
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

function formatGbp(n: number): string {
  return `£${n.toLocaleString("en-GB")}`;
}

// Own historical average cost for a given key (jobType/billType) - the
// most honest cost estimate available for a predicted item, since it
// reflects what this specific owner actually pays, not a generic UK
// figure. Falls back to the sourced benchmark (servicing only, and only
// for the narrow set of benchmarked job types) or is simply omitted
// (never invented) when neither is available.
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

// A due date can legitimately fall later in the CURRENT calendar month
// (e.g. something due in 3 weeks, computed today) - futureMonthKeys only
// covers whole months strictly after this one, so without this clamp
// such an item's cost would silently vanish from the chart's points
// despite correctly counting toward dueItems/the basis text. Folding it
// into the nearest future month keeps every due item visible somewhere.
function bucketKeyForDate(date: Date, windowMonths: number): string {
  const key = monthKey(date.toISOString());
  const validKeys = futureMonthKeys(windowMonths);
  return validKeys.includes(key) ? key : validKeys[0];
}

// ---------------------------------------------------------------------
// Servicing - event-based
// ---------------------------------------------------------------------

interface DueItem {
  jobType: string;
  dueDate: Date;
}

// Resolves a trigger's due point to an actual future calendar date - a
// mileage-type trigger needs the mileage projector to answer "when will
// the bike actually reach that mileage", which is the one place this
// forecast genuinely can't be more than roughly right (see
// projectFutureMileage's own comment on why that's an acceptable,
// disclosed simplification for a forecast rather than a real logged
// record).
function resolveTriggerDueDate(
  t: ReminderTrigger,
  r: ReminderDoc,
  currentMileage: number,
  mileagePoints: MileagePoint[],
  bikeLifetime: BikeLifetime
): Date | null {
  const due = computeTriggerDueValue(t, r);
  if (!due || due.type === "permanent") return null;
  if (due.dueDate) return new Date(due.dueDate);
  if (due.dueMileage != null) {
    if (due.dueMileage <= currentMileage) return new Date(); // already due - counts as "due now", not skipped
    // Binary-search-free approximation: project mileage forward day by
    // day is wasteful, so invert the rate directly instead - same rate
    // projectFutureMileage itself uses, just solved for time instead of
    // distance.
    const milesNeeded = due.dueMileage - currentMileage;
    const projectedIn30Days = projectFutureMileage(new Date(Date.now() + 30 * 86400000).toISOString(), mileagePoints, bikeLifetime);
    const ratePerDay = Math.max(0.1, (projectedIn30Days - currentMileage) / 30);
    const daysAhead = milesNeeded / ratePerDay;
    return new Date(Date.now() + daysAhead * 86400000);
  }
  return null;
}

export function buildServicingForecast(input: {
  records: ServiceRecordDoc[];
  reminders: ReminderDoc[];
  currentMileage: number;
  mileagePoints: MileagePoint[];
  bikeLifetime: BikeLifetime;
  bikeClass: BikeClass;
  window: ForecastWindow;
}): CategoryForecast {
  const windowMonths = FORECAST_WINDOW_MONTHS[input.window];
  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + windowMonths);

  const ownAverages = ownAverageByKey(input.records, (r) => r.jobType);

  const dueItems: DueItem[] = [];
  const coveredJobTypes = new Set<string>();

  // Active reminders first - sourceKey "service:<jobType>" is the
  // convention every service-record reminder already uses (see
  // reminder.ts/LogServiceForm.tsx); anything else (bill reminders,
  // SORN) is out of scope here.
  for (const reminder of input.reminders) {
    const jobType = reminder.sourceKey?.startsWith("service:") ? reminder.sourceKey.slice("service:".length) : null;
    if (!jobType) continue;
    coveredJobTypes.add(jobType);
    const triggers: ReminderTrigger[] = [
      { intervalType: reminder.intervalType, intervalValue: reminder.intervalValue, exactDate: reminder.exactDate },
      ...(reminder.additionalTriggers ?? []),
    ];
    let soonest: Date | null = null;
    for (const t of triggers) {
      const due = resolveTriggerDueDate(t, reminder, input.currentMileage, input.mileagePoints, input.bikeLifetime);
      if (due && (!soonest || due < soonest)) soonest = due;
    }
    if (soonest && soonest <= windowEnd) dueItems.push({ jobType, dueDate: soonest });
  }

  // Consumables with no active reminder - same fallback role
  // consumablesDueSoon.ts already plays elsewhere, just projected
  // forward instead of only checked against today.
  const latestByType = new Map<string, ServiceRecordDoc>();
  for (const r of input.records) {
    const existing = latestByType.get(r.jobType);
    if (!existing || r.mileage > existing.mileage) latestByType.set(r.jobType, r);
  }
  for (const [jobType, last] of latestByType) {
    if (coveredJobTypes.has(jobType)) continue;
    const def = JOB_REMINDER_DEFAULTS[jobType];
    if (!def) continue;
    const pseudoReminder: ReminderDoc = {
      id: "", pk: "", type: "reminder", date: last.date, createdAt: last.date, name: "",
      intervalType: def.type, intervalValue: def.value, baseMileage: last.mileage,
    };
    const trigger: ReminderTrigger = { intervalType: def.type, intervalValue: def.value };
    const due = resolveTriggerDueDate(trigger, pseudoReminder, input.currentMileage, input.mileagePoints, input.bikeLifetime);
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
      (isBenchmarkedJob(item.jobType) ? (getBenchmark(item.jobType, input.bikeClass).low + getBenchmark(item.jobType, input.bikeClass).high) / 2 : null);
    if (cost == null) {
      unpricedCount++;
      continue;
    }
    addToMonth(buckets, key, cost);
    pricedLabels.push(JOB_LABELS[item.jobType] ?? item.jobType);
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

// ---------------------------------------------------------------------
// Mods / Labour - pure average
// ---------------------------------------------------------------------

export function buildModsForecast(mods: ModDoc[], window: ForecastWindow): CategoryForecast {
  return buildAverageForecast(mods, FORECAST_WINDOW_MONTHS[window], "Parts & accessories");
}

export function buildLabourForecast(labour: LabourDoc[], window: ForecastWindow): CategoryForecast {
  return buildAverageForecast(labour, FORECAST_WINDOW_MONTHS[window], "Labour");
}

// ---------------------------------------------------------------------
// Bills - hybrid
// ---------------------------------------------------------------------

const KNOWN_DATE_BILL_TYPES = new Set(["road-tax", "insurance", "mot-test"]);

export function buildBillsForecast(input: { bills: BillDoc[]; reminders: ReminderDoc[]; window: ForecastWindow }): CategoryForecast {
  const windowMonths = FORECAST_WINDOW_MONTHS[input.window];
  const windowEnd = new Date();
  windowEnd.setMonth(windowEnd.getMonth() + windowMonths);
  const buckets = new Map<string, number>();
  const lumpLabels: string[] = [];

  // Road tax - reconstructed from the latest logged bill rather than a
  // live DVLA call (a forecast render shouldn't cost an extra external
  // API round-trip): same cost, due 12 months after it was last paid.
  // Same reconstruction for insurance/MOT, but only when the owner has
  // an active reminder for it - unlike road tax, this app has no
  // automatic, DVLA-sourced signal for either of those, so without a
  // reminder there's genuinely no known due point to show.
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

  // Everything else in the category (finance, ULEZ/CAZ, congestion
  // charge, and insurance/MOT when no reminder covers them) falls back
  // to the same flat average baseline Mods/Labour use - there's no
  // known due point for any of it.
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

// ---------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------

export interface BikeCostForecast {
  servicing: CategoryForecast;
  mods: CategoryForecast;
  bills: CategoryForecast;
  labour: CategoryForecast;
}

export function buildBikeCostForecast(input: {
  records: ServiceRecordDoc[];
  mods: ModDoc[];
  bills: BillDoc[];
  labour: LabourDoc[];
  reminders: ReminderDoc[];
  currentMileage: number;
  mileagePoints: MileagePoint[];
  bikeLifetime: BikeLifetime;
  bikeClass: BikeClass;
  window: ForecastWindow;
}): BikeCostForecast {
  return {
    servicing: buildServicingForecast(input),
    mods: buildModsForecast(input.mods, input.window),
    bills: buildBillsForecast({ bills: input.bills, reminders: input.reminders, window: input.window }),
    labour: buildLabourForecast(input.labour, input.window),
  };
}

const ALL_FORECAST_WINDOWS: ForecastWindow[] = ["3m", "6m", "1y"];

// page.tsx (a server component) can't know which window is currently
// selected - that's client-side state (ChartFilterContext) - so it
// computes all three up front, cheaply, rather than round-tripping to
// the server every time someone switches windows on the client. See
// CategorySpendChart.tsx's own `forecast` prop comment.
export function buildBikeCostForecastAllWindows(
  input: Omit<Parameters<typeof buildBikeCostForecast>[0], "window">
): Record<ForecastWindow, BikeCostForecast> {
  return Object.fromEntries(ALL_FORECAST_WINDOWS.map((window) => [window, buildBikeCostForecast({ ...input, window })])) as Record<
    ForecastWindow,
    BikeCostForecast
  >;
}

// Transposes a by-window bundle of every category's forecast (what
// buildBikeCostForecastAllWindows/buildCarCostForecastAllWindows return)
// into the shape CategorySpendChart's own `forecast` prop actually wants
// - one category's forecast, across all three windows - since each
// chart only ever cares about its own single category.
export function pickCategoryForecast<T extends object>(
  byWindow: Record<ForecastWindow, T>,
  category: { [K in keyof T]: T[K] extends CategoryForecast ? K : never }[keyof T]
): Record<ForecastWindow, CategoryForecast> {
  return Object.fromEntries(ALL_FORECAST_WINDOWS.map((w) => [w, byWindow[w][category] as CategoryForecast])) as unknown as Record<
    ForecastWindow,
    CategoryForecast
  >;
}
