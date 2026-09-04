// Place at: src/lib/tracker/bikeComparisonPeriod.ts
//
// Zero dependency on cosmos.ts, same reasoning as billSeriesSchedule.ts/
// bikeComparisonVerdict.ts - pure date-filtering logic for the bike
// comparison page's optional date-range filter, kept separate from
// bikeComparison.ts's own data-fetching so it's trivially testable.

export interface ComparisonPeriod {
  from?: string;
  to?: string;
}

// Both bounds are optional and inclusive - no period at all means
// "overall" (every entry counts), only `from` means "since a date",
// both means a specific period. That single from/to pair covers all
// three of "overall / since / specific period" without needing a
// separate mode switch.
export function isDateInRange(dateStr: string, period?: ComparisonPeriod): boolean {
  if (!period) return true;
  const t = new Date(dateStr).getTime();
  if (period.from && t < new Date(period.from).getTime()) return false;
  if (period.to && t > new Date(period.to).getTime()) return false;
  return true;
}

export interface MileagePoint {
  date: string;
  mileage: number;
}

// Best-effort mileage AS OF a boundary date - the mileage of the most
// recent logged entry on or before that date. Always resolved against
// the FULL, unfiltered set of mileage points (never just the ones
// already inside the period being looked at), since the nearest real
// reading before a boundary is very often outside the window itself -
// e.g. "miles ridden since 1 Jan" needs whatever was logged most
// recently BEFORE 1 Jan as its starting point, which by definition
// isn't in the "since 1 Jan" set. Falls back to the given default when
// nothing was logged that early yet.
export function mileageAsOf(points: MileagePoint[], boundary: string | undefined, fallback: number): number {
  if (!boundary) return fallback;
  const boundaryTime = new Date(boundary).getTime();
  const before = points.filter((p) => new Date(p.date).getTime() <= boundaryTime);
  if (before.length === 0) return fallback;
  return before.reduce((latest, p) => (new Date(p.date).getTime() > new Date(latest.date).getTime() ? p : latest)).mileage;
}
