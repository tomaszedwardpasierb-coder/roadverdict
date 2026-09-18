// Place at: src/lib/tracker/costForecast.ts
//
// Powers the dashboard/reports "Forecast" view (ForecastToggle.tsx,
// ChartFilterBar.tsx, CategorySpendChart.tsx, MileageChart.tsx,
// DashboardStatCards.tsx) - always computed server-side in page.tsx from
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
//
// The generic date/bucket helpers below (futureMonthKeys through
// mergePointsIntoBuckets, plus buildAverageForecast/averageDailyRate) are
// exported and reused as-is by carCostForecast.ts, unlike the rest of
// that file's vehicle-specific logic (which stays deliberately mirrored,
// not shared - see that file's own comment). None of these take a
// vehicle-specific type, so duplicating them would only be two copies of
// the same bucketing bug waiting to drift apart - which is exactly what
// happened before this window model existed.
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

// Values/order match the existing RangeValue "last X" options in
// dateRange.ts (minus "all"/"ytd", which have no forward equivalent) -
// deliberate, so the Forecast window selector can reuse the exact same
// range-bar look and component pattern as the real Range tabs, rather
// than being a bespoke widget of its own. See ChartFilterBar.tsx.
export const FORECAST_WINDOW_OPTIONS = [
  { value: "1w", label: "Next week" },
  { value: "1m", label: "Next month" },
  { value: "6m", label: "Next 6 months" },
  { value: "1y", label: "Next year" },
] as const;

export type ForecastWindow = (typeof FORECAST_WINDOW_OPTIONS)[number]["value"];

export const FORECAST_WINDOW_LABELS: Record<ForecastWindow, string> = Object.fromEntries(
  FORECAST_WINDOW_OPTIONS.map((o) => [o.value, o.label])
) as Record<ForecastWindow, string>;

export const ALL_FORECAST_WINDOWS: ForecastWindow[] = FORECAST_WINDOW_OPTIONS.map((o) => o.value);

// The one true "how far ahead" for every window - used for the due-date
// cutoff regardless of window size.
export const FORECAST_WINDOW_DAYS: Record<ForecastWindow, number> = { "1w": 7, "1m": 30, "6m": 182, "1y": 365 };

// Only 6m/1y are long enough to bucket into real, separate calendar
// months (a proper trend line); "1w"/"1m" collapse to a single flat
// bucket for the whole window instead (see isSubMonthWindow) - these two
// entries exist so that code path still has a number to work with, but
// neither is ever actually used to build a multi-point line.
export const FORECAST_WINDOW_MONTHS: Record<ForecastWindow, number> = { "1w": 0, "1m": 1, "6m": 6, "1y": 12 };

// How far back to look when computing the trailing average rate that
// feeds Mods/Labour/Bills-baseline. Deliberately NOT the same length as
// the forecast window itself for the two short windows - a genuine
// 7-day or 30-day lookback would be far too noisy for one vehicle's
// spend history to average over, so both borrow a steadier 3-month
// lookback instead.
const FORECAST_LOOKBACK_MONTHS: Record<ForecastWindow, number> = { "1w": 3, "1m": 3, "6m": 6, "1y": 12 };

function isSubMonthWindow(window: ForecastWindow): boolean {
  return window === "1w" || window === "1m";
}

// The due-date cutoff for a given window - day-based, not calendar-month
// based, so it's exactly as long as the window claims to be regardless
// of which months it happens to cross. Exported so page.tsx can compute
// a projected mileage figure (via mileageEstimate.ts's
// projectFutureMileage) for the exact same cutoff each spend forecast
// itself uses, keeping "projected miles" and "projected spend" honestly
// aligned to the same future point.
export function forecastWindowEndDate(window: ForecastWindow): Date {
  return new Date(Date.now() + FORECAST_WINDOW_DAYS[window] * 86400000);
}

export interface ForecastMonthPoint {
  month: string; // same "MMM YY" format bucketByMonth's real points use, or the window's own label ("Next week") for a sub-month window's single point
  // GBP for every spend category (converted to the display currency by
  // the chart, same as real data) or raw miles for projectMileageOverWindow
  // - whichever this point's own producing function actually forecasts.
  total: number;
}

export interface CategoryForecast {
  points: ForecastMonthPoint[];
  basis: string;
}

// ---------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------

export function futureMonthKeys(windowMonths: number): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 1; i <= windowMonths; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    keys.push(monthKey(d.toISOString()));
  }
  return keys;
}

// A single fixed key for a sub-month window's one-and-only bucket - "1w"
// and "1m" are too short to span even one whole future calendar month
// (see futureMonthKeys), so every due item/lump/average in that window
// collapses into this one bucket instead of a monthly line.
const SUB_MONTH_BUCKET_KEY = "window";

export function emptyForecastPoints(window: ForecastWindow): ForecastMonthPoint[] {
  if (isSubMonthWindow(window)) return [{ month: FORECAST_WINDOW_LABELS[window], total: 0 }];
  return futureMonthKeys(FORECAST_WINDOW_MONTHS[window]).map((k) => ({ month: monthLabel(k), total: 0 }));
}

// Trailing average £/day over the last `lookbackMonths`, extrapolated as
// a flat line - deliberately not a rolling/seasonal model. "Very steady
// lines" is the point: a personal one-vehicle spend history doesn't
// carry enough signal to justify anything fancier, and a flat line is
// honest about that rather than implying more confidence than the data
// supports.
export function averageDailyRate(items: { date: string; cost: number }[], lookbackMonths: number): number {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const inWindow = items.filter((i) => new Date(i.date) >= cutoff);
  if (inWindow.length === 0) return 0;
  const total = inWindow.reduce((sum, i) => sum + i.cost, 0);
  const oldestDate = inWindow.reduce((min, i) => (new Date(i.date) < min ? new Date(i.date) : min), new Date());
  const daysSpanned = Math.max(1, (Date.now() - oldestDate.getTime()) / 86400000);
  return total / daysSpanned;
}

export function buildAverageForecast(
  items: { date: string; cost: number }[],
  window: ForecastWindow,
  categoryLabel: string
): CategoryForecast {
  const lookbackMonths = FORECAST_LOOKBACK_MONTHS[window];
  const ratePerDay = averageDailyRate(items, lookbackMonths);
  if (ratePerDay === 0) {
    return { points: emptyForecastPoints(window), basis: `No ${categoryLabel.toLowerCase()} spend logged yet to base an estimate on.` };
  }
  const monthlyRounded = Math.round(ratePerDay * 30.44);
  const basis = `A steady ${formatGbp(monthlyRounded)}/month, based on your average ${categoryLabel.toLowerCase()} spend over the last ${lookbackMonths} month${lookbackMonths === 1 ? "" : "s"}.`;
  if (isSubMonthWindow(window)) {
    const windowTotal = Math.round(ratePerDay * FORECAST_WINDOW_DAYS[window]);
    return { points: [{ month: FORECAST_WINDOW_LABELS[window], total: windowTotal }], basis };
  }
  const points = futureMonthKeys(FORECAST_WINDOW_MONTHS[window]).map((k) => ({ month: monthLabel(k), total: monthlyRounded }));
  return { points, basis };
}

export function formatGbp(n: number): string {
  return `£${n.toLocaleString("en-GB")}`;
}

// Own historical average cost for a given key (jobType/billType) - the
// most honest cost estimate available for a predicted item, since it
// reflects what this specific owner actually pays, not a generic UK
// figure. Falls back to the sourced benchmark (servicing only, and only
// for the narrow set of benchmarked job types) or is simply omitted
// (never invented) when neither is available.
export function ownAverageByKey<T extends { cost: number }>(items: T[], keyFn: (item: T) => string): Map<string, number> {
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

export function addToMonth(buckets: Map<string, number>, bucketKeyStr: string, amount: number) {
  buckets.set(bucketKeyStr, (buckets.get(bucketKeyStr) ?? 0) + amount);
}

// A due date can legitimately fall later in the CURRENT calendar month
// (e.g. something due in 3 weeks, computed today) - futureMonthKeys only
// covers whole months strictly after this one, so without a clamp such
// an item's cost would silently vanish from the chart's points despite
// correctly counting toward dueItems/the basis text. Folding it into the
// nearest future month keeps every due item visible somewhere. A
// sub-month window has no such problem - everything in it collapses to
// the one fixed bucket regardless of which day it falls on.
export function bucketKeyForDate(date: Date, window: ForecastWindow): string {
  if (isSubMonthWindow(window)) return SUB_MONTH_BUCKET_KEY;
  const windowMonths = FORECAST_WINDOW_MONTHS[window];
  const key = monthKey(date.toISOString());
  const validKeys = futureMonthKeys(windowMonths);
  return validKeys.includes(key) ? key : validKeys[0];
}

export function pointsFromBuckets(buckets: Map<string, number>, window: ForecastWindow): ForecastMonthPoint[] {
  if (isSubMonthWindow(window)) {
    return [{ month: FORECAST_WINDOW_LABELS[window], total: Math.round(buckets.get(SUB_MONTH_BUCKET_KEY) ?? 0) }];
  }
  return futureMonthKeys(FORECAST_WINDOW_MONTHS[window]).map((k) => ({ month: monthLabel(k), total: Math.round(buckets.get(k) ?? 0) }));
}

// Folds an already-built CategoryForecast's own points (e.g. the flat
// average baseline) into a shared bucket map another part of the same
// category forecast is also writing into (e.g. Bills' known-renewal
// lumps) - positional for a whole-month window (points[i] is
// futureMonthKeys(...)[i], same order both were built in), or the one
// fixed key for a sub-month window.
export function mergePointsIntoBuckets(buckets: Map<string, number>, points: ForecastMonthPoint[], window: ForecastWindow) {
  if (isSubMonthWindow(window)) {
    addToMonth(buckets, SUB_MONTH_BUCKET_KEY, points[0]?.total ?? 0);
    return;
  }
  const keys = futureMonthKeys(FORECAST_WINDOW_MONTHS[window]);
  points.forEach((p, i) => addToMonth(buckets, keys[i], p.total));
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
  const windowEnd = forecastWindowEndDate(input.window);

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
    const key = bucketKeyForDate(item.dueDate, input.window);
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

  const points = pointsFromBuckets(buckets, input.window);
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
  return buildAverageForecast(mods, window, "Parts & accessories");
}

export function buildLabourForecast(labour: LabourDoc[], window: ForecastWindow): CategoryForecast {
  return buildAverageForecast(labour, window, "Labour");
}

// ---------------------------------------------------------------------
// Bills - hybrid
// ---------------------------------------------------------------------

const KNOWN_DATE_BILL_TYPES = new Set(["road-tax", "insurance", "mot-test"]);

export function buildBillsForecast(input: { bills: BillDoc[]; reminders: ReminderDoc[]; window: ForecastWindow }): CategoryForecast {
  const windowEnd = forecastWindowEndDate(input.window);
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
      addToMonth(buckets, bucketKeyForDate(due, input.window), latest.cost);
      lumpLabels.push(billType);
    }
  }

  // Everything else in the category (finance, ULEZ/CAZ, congestion
  // charge, and insurance/MOT when no reminder covers them) falls back
  // to the same flat average baseline Mods/Labour use - there's no
  // known due point for any of it.
  const baselineItems = input.bills.filter((b) => !(KNOWN_DATE_BILL_TYPES.has(b.billType) && lumpLabels.includes(b.billType)));
  const baseline = buildAverageForecast(baselineItems, input.window, "other bills");
  mergePointsIntoBuckets(buckets, baseline.points, input.window);

  const points = pointsFromBuckets(buckets, input.window);
  const basisParts: string[] = [];
  if (lumpLabels.length > 0) basisParts.push(`known renewals (${lumpLabels.join(", ")}) at last year's cost`);
  if (baseline.points.some((p) => p.total > 0)) basisParts.push("a steady average for everything else");
  const basis = basisParts.length > 0 ? `Based on ${basisParts.join(", plus ")}.` : "No bills logged yet to base an estimate on.";
  return { points, basis };
}

// ---------------------------------------------------------------------
// Fuel - pure average (same method as Mods/Labour: no due-date concept)
// ---------------------------------------------------------------------

// Fuel has no CategorySpendChart column of its own in Reports (see this
// file's own top comment on the four categories that do), so this is
// never wired into BikeCostForecast/CarCostForecast below - it exists
// only to power SpendDonutChart's forecast mode (see
// buildCategoryTotalsForWindow), which needs a fifth category total to
// keep matching its own real-data ring exactly.
export function buildFuelForecast(fuelLogs: { date: string; cost: number }[], window: ForecastWindow): CategoryForecast {
  return buildAverageForecast(fuelLogs, window, "Fuel");
}

// ---------------------------------------------------------------------
// Mileage over time - a genuine multi-point trend, not just an endpoint
// ---------------------------------------------------------------------

// The mileage equivalent of a CategoryForecast's points - one point per
// future month for a whole-month window (the same monthly resolution
// CategorySpendChart itself uses), collapsing to the window's own single
// point for a sub-month window, same rule every other forecast in this
// file follows. No `basis` string - MileageChart has nowhere to show one
// (unlike a CategorySpendChart's basis text, mileage's own on-chart
// Estimate badge already carries that signal).
export function projectMileageOverWindow(window: ForecastWindow, mileagePoints: MileagePoint[], lifetime: BikeLifetime): ForecastMonthPoint[] {
  if (isSubMonthWindow(window)) {
    return [{ month: FORECAST_WINDOW_LABELS[window], total: Math.round(projectFutureMileage(forecastWindowEndDate(window).toISOString(), mileagePoints, lifetime)) }];
  }
  const windowMonths = FORECAST_WINDOW_MONTHS[window];
  const now = new Date();
  const points: ForecastMonthPoint[] = [];
  for (let i = 1; i <= windowMonths; i++) {
    const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
    points.push({ month: monthLabel(monthKey(target.toISOString())), total: Math.round(projectFutureMileage(target.toISOString(), mileagePoints, lifetime)) });
  }
  return points;
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

// page.tsx (a server component) can't know which window is currently
// selected - that's client-side state (ChartFilterContext) - so it
// computes all four up front, cheaply, rather than round-tripping to
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
// - one category's forecast, across all four windows - since each
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

export function categoryForecastTotal(forecast: CategoryForecast): number {
  return forecast.points.reduce((sum, p) => sum + p.total, 0);
}

// Sums every category's forecast total across the whole window - powers
// DashboardStatCards' "Projected spend" card, which cares about one
// grand total, not a per-category breakdown. Structural, not tied to
// BikeCostForecast specifically, so carCostForecast.ts's CarCostForecast
// (same four named fields) satisfies it too without its own copy.
export function totalForecastSpend(forecast: { servicing: CategoryForecast; mods: CategoryForecast; bills: CategoryForecast; labour: CategoryForecast }): number {
  return [forecast.servicing, forecast.mods, forecast.bills, forecast.labour].reduce((sum, c) => sum + categoryForecastTotal(c), 0);
}

export interface ForecastCategoryTotals {
  servicing: number;
  mods: number;
  fuel: number;
  bills: number;
  labour: number;
}

// Powers SpendDonutChart's forecast mode - one grand total per category
// for the window, not the monthly-trend points CategorySpendChart needs,
// since a donut only ever shows "how much of each" for the window as a
// whole. Structural over the four shared fields, like totalForecastSpend
// above, plus Fuel (see buildFuelForecast's own comment on why that one
// isn't part of BikeCostForecast/CarCostForecast itself).
export function buildCategoryTotalsForWindow(
  forecast: { servicing: CategoryForecast; mods: CategoryForecast; bills: CategoryForecast; labour: CategoryForecast },
  fuelLogs: { date: string; cost: number }[],
  window: ForecastWindow
): ForecastCategoryTotals {
  return {
    servicing: categoryForecastTotal(forecast.servicing),
    mods: categoryForecastTotal(forecast.mods),
    fuel: categoryForecastTotal(buildFuelForecast(fuelLogs, window)),
    bills: categoryForecastTotal(forecast.bills),
    labour: categoryForecastTotal(forecast.labour),
  };
}
