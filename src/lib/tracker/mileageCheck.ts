// Place at: src/lib/tracker/mileageCheck.ts
//
// The single source of truth for mileage consistency, used both for
// live, as-you-type client feedback and for the server-side hard
// validation on save - previously these were two separate systems
// (this file's own neighbour-only search, and a second, global-search
// version in mileageConflict.ts) that could disagree with each other.
// Unified onto the more robust algorithm (checks every other record for
// the closest conflict in each direction, not just the immediate
// neighbours - the neighbour-only version could theoretically miss a
// conflict against a further-out record if the data around it was
// itself already inconsistent), while keeping this file's own
// three-tier status model, which the neighbour-only version got right
// and the global-search version didn't have: "today or future, but
// lower than the bike's actual current mileage" is a fact, not a
// judgement call, and should never be overridable, unlike a historical
// entry that conflicts with a neighbouring record, which genuinely can
// have a rare legitimate explanation (an odometer replacement, say).

export interface HistoryPoint {
  id?: string;
  date: string;
  mileage: number;
}

export type MileageCheckReason = "today-lower" | "below-earlier" | "above-later";

export interface MileageCheckResult {
  status: "ok" | "warning" | "blocked";
  reason?: MileageCheckReason;
  referenceMileage?: number;
  referenceDate?: string;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Returns structured data, not a pre-built message - the display layer
// formats the numbers in whatever distance unit the person prefers.
// excludeId is optional and only relevant when editing an existing
// record - omitting it is exactly how every current client caller
// already uses this function, so nothing about their behaviour changes.
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

  // Closest conflict in each direction, across every record - not just
  // the immediate neighbours - so a conflict against a further-out
  // record is caught even in data that's already a little messy
  // elsewhere, which is exactly the kind of history this app has had
  // to handle throughout.
  let closest: { direction: "below-earlier" | "above-later"; mileage: number; date: string } | null = null;
  let closestGapMs = Infinity;

  for (const point of history) {
    if (excludeId && point.id === excludeId) continue;
    const pointTime = new Date(point.date).getTime();
    const gap = Math.abs(pointTime - entryTime);

    if (pointTime < entryTime && point.mileage > enteredMileage && gap < closestGapMs) {
      closest = { direction: "below-earlier", mileage: point.mileage, date: point.date };
      closestGapMs = gap;
    }
    if (pointTime > entryTime && point.mileage < enteredMileage && gap < closestGapMs) {
      closest = { direction: "above-later", mileage: point.mileage, date: point.date };
      closestGapMs = gap;
    }
  }

  if (closest) {
    return { status: "warning", reason: closest.direction, referenceMileage: closest.mileage, referenceDate: closest.date };
  }

  return { status: "ok" };
}

// Formats a MileageCheckResult into the same clear, actionable wording
// the old hard-block message used - names the exact bound, not just
// that something's wrong.
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
