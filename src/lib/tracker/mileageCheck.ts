// Place at: src/lib/tracker/mileageCheck.ts

export interface HistoryPoint {
  date: string;
  mileage: number;
}

export interface MileageCheckResult {
  status: "ok" | "warning" | "blocked";
  message?: string;
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// A same-day/future entry can never be lower than the bike's current
// mileage - hard block, no override, since there's no legitimate
// backdating explanation for "today." A backdated entry is instead
// checked against its real chronological neighbours (the closest
// existing entry before it and after it), not just the single latest
// reading - so a genuinely old record slots in correctly, while one
// that's inconsistent with the actual timeline still gets flagged.
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
      return {
        status: "blocked",
        message: `This is dated today or later, so it can't be lower than your bike's current recorded mileage (${currentMileage.toLocaleString()}).`,
      };
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
    return {
      status: "warning",
      message: `This is lower than an earlier entry on ${fmtDate(prev.date)} (${prev.mileage.toLocaleString()} miles). If this is correct, confirm below.`,
    };
  }
  if (next && enteredMileage > next.mileage) {
    return {
      status: "warning",
      message: `This is higher than a later entry on ${fmtDate(next.date)} (${next.mileage.toLocaleString()} miles). If this is correct, confirm below.`,
    };
  }

  return { status: "ok" };
}
