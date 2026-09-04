// Place at: src/lib/tracker/bikeComparisonVerdict.ts
//
// Deliberately has ZERO dependency on cosmos.ts or cosmosHelpers.ts, even
// indirectly - same reasoning as reminderStatus.ts/billSeriesSchedule.ts.
// Pure headline/winner logic for the bike comparison page, kept separate
// from bikeComparison.ts's own data-fetching so it's trivially testable
// and safe to import from anywhere.

export interface ComparisonCostInput {
  bikeId: string;
  name: string;
  costPerMile: number | null;
}

// "Cost per mile is the one number that's actually fair" - the headline
// this whole page leads with. Deliberately says nothing when there
// aren't at least two bikes with a real cost/mile figure, or when the
// gap is close enough to round to 0% - a manufactured-sounding "0% less"
// headline is worse than no headline at all.
export function buildCostPerMileVerdict(entries: ComparisonCostInput[]): string | null {
  const ranked = entries
    .filter((e): e is ComparisonCostInput & { costPerMile: number } => e.costPerMile != null)
    .sort((a, b) => a.costPerMile - b.costPerMile);
  if (ranked.length < 2) return null;

  const [best, nextBest] = ranked;
  if (nextBest.costPerMile <= 0) return null;

  const pct = Math.round(((nextBest.costPerMile - best.costPerMile) / nextBest.costPerMile) * 100);
  if (pct <= 0) return null;

  if (ranked.length === 2) {
    return `${best.name} costs you ${pct}% less per mile than ${nextBest.name}.`;
  }
  return `${best.name} is your cheapest bike to run, by ${pct}% over your next-best, ${nextBest.name}.`;
}

// Which bike has the best value in a given numeric metric - "lower" for
// cost figures, "higher" for things like documentation completeness or
// MPG. Returns null (no winner highlighted) when there's nothing to
// compare or the best value is tied across two or more bikes - a tie
// isn't a win for either one.
export function pickWinnerId(
  entries: { bikeId: string; value: number | null }[],
  direction: "lower" | "higher"
): string | null {
  const valid = entries.filter((e): e is { bikeId: string; value: number } => e.value != null);
  if (valid.length < 2) return null;

  const best = valid.reduce((a, b) => {
    const bIsBetter = direction === "lower" ? b.value < a.value : b.value > a.value;
    return bIsBetter ? b : a;
  });

  const tied = valid.some((e) => e.bikeId !== best.bikeId && e.value === best.value);
  return tied ? null : best.bikeId;
}
