// Place at: src/lib/tracker/mileageCheck.ts
//
// The single source of truth for mileage consistency, used both for
// live, as-you-type client feedback and for the server-side hard
// validation on save.

export interface HistoryPoint {
  id?: string;
  category?: "service" | "fuel" | "mods";
  date: string;
  mileage: number;
}

export type MileageCheckReason = "today-lower" | "below-earlier" | "above-later";

export interface MileageCheckResult {
  status: "ok" | "warning" | "blocked";
  reason?: MileageCheckReason;
  referenceMileage?: number;
  referenceDate?: string;
  // The specific conflicting entry, when history points carry an id -
  // lets the conflict-resolution screen fetch and show that exact
  // record (including its own receipt image) side by side, rather than
  // only knowing a number and a date.
  referenceId?: string;
  referenceCategory?: "service" | "fuel" | "mods";
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function checkMileageConsistency(
  enteredMileage: number,
  entryDate: string,
  history: HistoryPoint[],
  currentMileage: number,
  excludeId?: string | null
): MileageCheckResult {
  if (!enteredMileage || !entryDate) return { status: "ok" };

  const entryTime = new Date(entryDate).getTime();
  const isTodayOrFuture = entryTime >= startOfToday();

  if (isTodayOrFuture) {
    if (enteredMileage < currentMileage) {
      return { status: "blocked", reason: "today-lower", referenceMileage: currentMileage };
    }
    return { status: "ok" };
  }

  let closest: { direction: "below-earlier" | "above-later"; mileage: number; date: string; id?: string; category?: "service" | "fuel" | "mods" } | null = null;
  let closestGapMs = Infinity;

  for (const point of history) {
    if (excludeId && point.id === excludeId) continue;
    const pointTime = new Date(point.date).getTime();
    const gap = Math.abs(pointTime - entryTime);

    if (pointTime < entryTime && point.mileage > enteredMileage && gap < closestGapMs) {
      closest = { direction: "below-earlier", mileage: point.mileage, date: point.date, id: point.id, category: point.category };
      closestGapMs = gap;
    }
    if (pointTime > entryTime && point.mileage < enteredMileage && gap < closestGapMs) {
      closest = { direction: "above-later", mileage: point.mileage, date: point.date, id: point.id, category: point.category };
      closestGapMs = gap;
    }
  }

  if (closest) {
    return {
      status: "warning",
      reason: closest.direction,
      referenceMileage: closest.mileage,
      referenceDate: closest.date,
      referenceId: closest.id,
      referenceCategory: closest.category,
    };
  }

  return { status: "ok" };
}

export function describeMileageCheck(result: MileageCheckResult): string {
  if (result.status === "ok" || !result.reason) return "";
  const m = result.referenceMileage?.toLocaleString() ?? "";
  if (result.reason === "today-lower") {
    return `This can't be lower than the bike's current recorded mileage (${m}) for an entry dated today or later.`;
  }
  const d = result.referenceDate ? new Date(result.referenceDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
  return result.reason === "below-earlier"
    ? `A record from ${d} already shows ${m} miles, and that's earlier than this one. Enter ${m} miles or more to keep the timeline consistent.`
    : `A record from ${d} already shows ${m} miles, and that's later than this one. Enter ${m} miles or fewer to keep the timeline consistent.`;
}
