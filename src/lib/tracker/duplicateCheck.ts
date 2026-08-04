// Place at: src/lib/tracker/duplicateCheck.ts
//
// Deliberately deterministic, not a second AI call - a duplicate is a
// factual question (does this cost/date/category combination already
// exist for this bike?), not a judgement call, so plain arithmetic
// answers it more cheaply and more predictably than asking a model to
// "decide" again. Runs against whatever's already been fetched by the
// caller - no extra queries of its own.

export interface DuplicateCheckCandidate {
  id: string;
  date: string;
  cost: number;
  description: string;
}

export interface DuplicateMatch {
  id: string;
  date: string;
  cost: number;
  description: string;
}

// A few days apart covers "logged the receipt a bit late", not just the
// exact same day - genuinely different purchases are almost never both
// this close in date AND within a few pence of each other.
const DATE_WINDOW_DAYS = 3;
const COST_TOLERANCE_GBP = 0.5;

// Compares one new item (already resolved to GBP) against every existing
// record already logged in the same category for this bike, and returns
// the closest match within tolerance, or null. Category scoping is the
// caller's responsibility (pass only same-category candidates in) -
// keeping that decision outside this function is what lets it stay a
// plain, five-line comparison rather than something in the fields it needs.
export function findPossibleDuplicate(
  candidateDate: string,
  candidateCostGbp: number,
  existing: DuplicateCheckCandidate[]
): DuplicateMatch | null {
  const candidateTime = new Date(candidateDate).getTime();
  let best: DuplicateMatch | null = null;
  let bestDayDiff = Infinity;

  for (const item of existing) {
    const dayDiff = Math.abs(new Date(item.date).getTime() - candidateTime) / 86_400_000;
    const costDiff = Math.abs(item.cost - candidateCostGbp);
    if (dayDiff <= DATE_WINDOW_DAYS && costDiff <= COST_TOLERANCE_GBP && dayDiff < bestDayDiff) {
      bestDayDiff = dayDiff;
      best = { id: item.id, date: item.date, cost: item.cost, description: item.description };
    }
  }

  return best;
}
