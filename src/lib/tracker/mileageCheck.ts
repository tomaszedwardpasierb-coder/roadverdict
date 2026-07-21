// Place at: src/lib/tracker/mileageCheck.ts

export interface HistoryPoint {
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
export function checkMileageConsistency(
  enteredMileage: number,
  entryDate: string,
  history: HistoryPoint[],
  currentMileage: number
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

  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  let prev: HistoryPoint | null = null;
  let next: HistoryPoint | null = null;
  for (const point of sorted) {
    const pointTime = new Date(point.date).getTime();
    if (pointTime <= entryTime) {
      prev = point;
    } else if (!next) {
      next = point;
    }
  }

  if (prev && enteredMileage < prev.mileage) {
    return { status: "warning", reason: "below-earlier", referenceMileage: prev.mileage, referenceDate: prev.date };
  }
  if (next && enteredMileage > next.mileage) {
    return { status: "warning", reason: "above-later", referenceMileage: next.mileage, referenceDate: next.date };
  }

  return { status: "ok" };
}
