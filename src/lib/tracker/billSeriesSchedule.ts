// Place at: src/lib/tracker/billSeriesSchedule.ts
//
// Deliberately has ZERO dependency on cosmos.ts or cosmosHelpers.ts, even
// indirectly - billSeries.ts imports the Cosmos SDK at its top level
// (needed for its data-layer functions), so importing anything from it as
// a VALUE, even one small date calculation, drags the whole SDK into any
// client bundle that does so. This file exists so client components (the
// log form, the series summary card) can compute schedule/display facts
// without that cost. Same split, same reasoning, as reminderStatus.ts vs
// reminder.ts.

export type BillSeriesBillType = "insurance" | "road-tax" | "finance";
export type BillSeriesFrequency = "monthly" | "six-monthly";

interface SeriesScheduleInput {
  startDate: string;
  frequency: BillSeriesFrequency;
  collectionDay: number;
}

interface SeriesAmountInput {
  depositAmount?: number;
  instalmentAmount: number;
}

function periodsPerStep(frequency: BillSeriesFrequency): number {
  return frequency === "monthly" ? 1 : 6;
}

// Adds `monthsToAdd` calendar months to `base`, anchored to the 1st of
// base's month (base's own day-of-month is never carried forward), then
// clamps the result to `targetDay` or the last real day of that month,
// whichever is smaller. Deliberately NOT `setMonth`/`setDate` arithmetic
// on a running date - repeatedly adding months to a date that already
// has a day set is exactly the shortcut that previously caused a real
// bug elsewhere in this app when a span crossed into a shorter month (or
// DST). Computing the target month directly from the index, every time,
// sidesteps that entirely. All arithmetic is UTC-based so there's no
// local-timezone/DST edge case to begin with.
function addMonthsClamped(base: Date, monthsToAdd: number, targetDay: number): Date {
  const totalMonth = base.getUTCFullYear() * 12 + base.getUTCMonth() + monthsToAdd;
  const targetYear = Math.floor(totalMonth / 12);
  const targetMonth = ((totalMonth % 12) + 12) % 12;
  const lastDayOfMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(targetDay, lastDayOfMonth);
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Index 0 is always exactly startDate (the actual first/deposit payment
// date) - collectionDay only governs payments after that one, which is
// why it isn't applied to index 0.
export function paymentDateForIndex(series: SeriesScheduleInput, index: number): string {
  if (index === 0) return series.startDate;
  const start = new Date(series.startDate);
  const monthsToAdd = index * periodsPerStep(series.frequency);
  return toIsoDate(addMonthsClamped(start, monthsToAdd, series.collectionDay));
}

export function paymentAmountForIndex(series: SeriesAmountInput, index: number): number {
  if (index === 0 && series.depositAmount != null) return series.depositAmount;
  return series.instalmentAmount;
}

// Human-readable note auto-filled onto a materialised instalment - also
// what BillCard shows to distinguish it from a manually logged entry.
export function instalmentNote(series: { instalmentCount: number; depositAmount?: number }, index: number): string {
  if (index === 0 && series.depositAmount != null) {
    return `Deposit (payment 1 of ${series.instalmentCount})`;
  }
  return `Instalment ${index + 1} of ${series.instalmentCount}`;
}

// The date the plan's term actually ends (one step past the last
// instalment) - what a renewal reminder should anchor to, not the date
// of the final payment itself.
export function seriesEndDate(series: SeriesScheduleInput & { instalmentCount: number }): string {
  return paymentDateForIndex(series, series.instalmentCount);
}

// Total cost of the whole plan AS SPECIFIED, never back-derived from an
// assumed annual premium - deposit (if any) plus every regular
// instalment, taking exactly the figures the owner entered as fact.
export function seriesTotalCost(series: SeriesAmountInput & { instalmentCount: number }): number {
  if (series.instalmentCount <= 0) return 0;
  return paymentAmountForIndex(series, 0) + (series.instalmentCount - 1) * series.instalmentAmount;
}

export interface DueInstalment {
  index: number;
  date: string;
  cost: number;
}

// Pure - no I/O, no side effects. Everything after lastMaterializedIndex
// that's due on or before `today`. Dates for increasing indices only ever
// increase, so it's safe to stop at the first one that isn't due yet
// rather than scanning the whole remaining term.
export function computeDueInstalments(
  series: SeriesScheduleInput & SeriesAmountInput & { instalmentCount: number; lastMaterializedIndex: number; status: "active" | "completed" | "ended" },
  today: Date
): DueInstalment[] {
  if (series.status !== "active") return [];
  const due: DueInstalment[] = [];
  for (let index = series.lastMaterializedIndex + 1; index < series.instalmentCount; index++) {
    const date = paymentDateForIndex(series, index);
    if (new Date(date) > today) break;
    due.push({ index, date, cost: paymentAmountForIndex(series, index) });
  }
  return due;
}
