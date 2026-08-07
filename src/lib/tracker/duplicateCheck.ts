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

// Meaningfully different descriptions rule out a match even when date
// and cost line up exactly - a single multi-line garage invoice (oil
// change, brake pads, chain adjustment, all on the same date) routinely
// has two line items that coincidentally cost the same, and those are
// obviously not duplicates of each other. Deliberately simple word
// overlap, not a second AI call - same reasoning as the rest of this
// file: a plain, predictable comparison beats asking a model to
// "decide" again, and this only needs to catch "genuinely unrelated",
// not judge nuance.
const STOP_WORDS = new Set(["and", "the", "a", "an", "of", "in", "on", "to", "at", "for", "with"]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
  );
}

// Deliberately permissive when either description reduces to nothing
// meaningful (e.g. "Other", stop words only) - there's nothing to
// compare, so this falls back to the original date+cost behaviour
// rather than blocking a genuine duplicate check on an edge case.
function descriptionsAreSimilarEnough(a: string, b: string): boolean {
  const wordsA = significantWords(a);
  const wordsB = significantWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return true;
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared++;
  return shared / Math.min(wordsA.size, wordsB.size) >= 0.5;
}

// Compares one new item (already resolved to GBP) against every existing
// record already logged in the same category for this bike, and returns
// the closest match within tolerance, or null. Category scoping is the
// caller's responsibility (pass only same-category candidates in) -
// keeping that decision outside this function is what lets it stay a
// plain, five-line comparison rather than something in the fields it needs.
export function findPossibleDuplicate(
  candidateDate: string,
  candidateCostGbp: number,
  existing: DuplicateCheckCandidate[],
  candidateDescription?: string
): DuplicateMatch | null {
  const candidateTime = new Date(candidateDate).getTime();
  let best: DuplicateMatch | null = null;
  let bestDayDiff = Infinity;

  for (const item of existing) {
    const dayDiff = Math.abs(new Date(item.date).getTime() - candidateTime) / 86_400_000;
    const costDiff = Math.abs(item.cost - candidateCostGbp);
    if (dayDiff > DATE_WINDOW_DAYS || costDiff > COST_TOLERANCE_GBP || dayDiff >= bestDayDiff) continue;
    if (candidateDescription && !descriptionsAreSimilarEnough(candidateDescription, item.description)) continue;
    bestDayDiff = dayDiff;
    best = { id: item.id, date: item.date, cost: item.cost, description: item.description };
  }

  return best;
}
