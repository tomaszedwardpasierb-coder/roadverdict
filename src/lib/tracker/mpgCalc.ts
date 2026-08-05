// Place at: src/lib/tracker/mpgCalc.ts
//
// Deliberately has ZERO dependency on cosmos.ts or cosmosHelpers.ts, even
// indirectly. fuelLog.ts imports the Cosmos SDK at its top level (needed
// for its data-layer functions), so importing a VALUE from it - even one
// small pure calculation - drags the whole SDK into any client bundle
// that does so. This file exists so client components can get MPG maths
// without that cost.

export interface MpgSegment {
  mileage: number;
  mpg: number;
  date: string;
  fuelLogId: string;
  likelyMissedFillUps: boolean;
  // Only meaningful when likelyMissedFillUps is true. Two genuinely
  // different problems get the same exclude-from-average treatment, but
  // deserve different explanations: "unusual-gap" means the dates and
  // mileages themselves are direct, structural evidence something broke
  // continuity, independent of what mpg it happens to produce.
  // "anomalous-value" means the dates/mileages look perfectly ordinary,
  // but the resulting mpg is a statistical outlier against this rider's
  // own history - the softer, inferred case.
  exclusionReason?: "unusual-gap" | "anomalous-value";
}

export interface MpgCalcInput {
  id: string;
  mileage: number;
  litres: number;
  filledToFull: boolean;
  date: string;
  mileageConfidence?: "interpolated" | "estimated" | "confirmed";
}

// Modified z-score outlier detection (Iglewicz & Hoaglin, "How to
// Detect and Handle Outliers", ASQC Quality Press, 1993) - a standard,
// widely-cited robust-statistics method, used here instead of a single
// fixed percentage-of-baseline threshold. The reason: a fixed percentage
// treats every rider identically regardless of how naturally consistent
// or scattered their own readings are. A rider who always rides the
// same commute has a tight baseline and a genuine missed fill-up stands
// out clearly even at a modest deviation; a rider who mixes motorway,
// town, and the occasional loaded touring trip has real month-to-month
// swings that a single generous threshold either misses for the first
// rider or false-flags for the second. The modified z-score adapts to
// each rider's OWN observed spread (via the median absolute deviation,
// MAD - the robust equivalent of standard deviation) instead of using
// one number for everyone. 3.5 is Iglewicz & Hoaglin's own recommended
// threshold for "likely outlier".
const MODIFIED_ZSCORE_THRESHOLD = 3.5;
const MAD_SCALE_CONSTANT = 0.6745; // makes the modified z-score comparable to a standard z-score under normality
// If this rider's own baseline is unusually tight, a MAD near zero
// would make the z-score hypersensitive to completely normal tiny
// variation - fall back to a plain percentage check in that case instead.
const MIN_MAD_TO_BASELINE_RATIO = 0.03;
// MAD itself needs a reasonably-sized sample to be a stable estimate -
// with only 2-3 points, the median and MAD are themselves noisy, and
// the modified z-score can false-flag genuine variation (verified
// against a synthetic mixed-riding scenario: with fewer than 5 points,
// two real, non-anomalous ~25% swings were wrongly flagged). Below this
// count, fall back to a deliberately conservative fixed ratio instead -
// less sensitive, but safe while there simply isn't enough of this
// rider's own history yet to know what their normal spread looks like.
const MIN_SEGMENTS_FOR_ADAPTIVE_METHOD = 5;
const MIN_VALID_SEGMENTS_FOR_BASELINE = 2;
const EARLY_FALLBACK_DEVIATION_RATIO = 0.75;
// Two flagged VALUE anomalies in a row, both off in roughly the same
// direction from the SAME stale baseline, reads as a genuine sustained
// change rather than a one-off - a real missed fill-up is a single
// blip, not a run of them. A GAP anomaly doesn't need this same
// caution: an unusually large gap is direct structural evidence (the
// dates/mileages themselves prove it), not an inference from a single
// number, so it resets the baseline immediately rather than waiting
// for a second occurrence to confirm.
const CONSECUTIVE_ANOMALIES_RESET_BASELINE = 2;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function medianAbsoluteDeviation(values: number[], med: number): number {
  return median(values.map((v) => Math.abs(v - med)));
}

// Signed modified z-score - callers decide direction. The MPG-value
// check cares about deviation in either direction (too good OR too
// bad); the gap check only cares about "much bigger than usual".
function modifiedZScore(candidate: number, baselineValues: number[]): number | null {
  const baseline = median(baselineValues);
  if (baseline <= 0) return null;
  if (baselineValues.length < MIN_SEGMENTS_FOR_ADAPTIVE_METHOD) return null;
  const mad = medianAbsoluteDeviation(baselineValues, baseline);
  if (mad <= baseline * MIN_MAD_TO_BASELINE_RATIO) return null;
  return (MAD_SCALE_CONSTANT * (candidate - baseline)) / mad;
}

function isAnomalousValue(candidate: number, baselineValues: number[]): boolean {
  const baseline = median(baselineValues);
  if (baseline <= 0) return false;
  const z = modifiedZScore(candidate, baselineValues);
  if (z !== null) return Math.abs(z) > MODIFIED_ZSCORE_THRESHOLD;
  return Math.abs(candidate - baseline) / baseline > EARLY_FALLBACK_DEVIATION_RATIO;
}

// One-directional on purpose - a SHORTER than normal gap between
// fill-ups isn't a red flag on its own (topping up more often than
// usual just happens); only a much LARGER gap suggests either a long
// trip or, far more often, an unlogged fill-up hiding inside it.
function isUnusuallyLargeGap(candidateMiles: number, baselineGaps: number[]): boolean {
  const baseline = median(baselineGaps);
  if (baseline <= 0) return false;
  const z = modifiedZScore(candidateMiles, baselineGaps);
  if (z !== null) return z > MODIFIED_ZSCORE_THRESHOLD;
  return candidateMiles > baseline * (1 + EARLY_FALLBACK_DEVIATION_RATIO);
}

// A fill-up whose mileage hasn't been human-verified breaks the chain
// entirely, rather than being silently dropped or averaged through -
// dropping it outright would wrongly attribute its fuel to whatever
// segment spans over the gap, understating the fuel actually used for
// that distance. Breaking the chain means neither the segment ending at
// this fill-up nor the one starting from it gets computed; the next
// verified full-tank fill-up simply starts a fresh chain.
export function computeMPGSeries(fuelLogs: MpgCalcInput[]): MpgSegment[] {
  const sorted = [...fuelLogs].sort((a, b) => a.mileage - b.mileage);
  const raw: { mileage: number; mpg: number; date: string; fuelLogId: string; miles: number }[] = [];
  let litresSinceLastFull = 0;
  let lastFullMileage: number | null = null;
  for (const log of sorted) {
    const mileageUnverified = log.mileageConfidence === "estimated" || log.mileageConfidence === "interpolated";
    if (mileageUnverified) {
      lastFullMileage = null;
      litresSinceLastFull = 0;
      continue;
    }
    litresSinceLastFull += log.litres;
    if (log.filledToFull) {
      if (lastFullMileage !== null) {
        const miles = log.mileage - lastFullMileage;
        if (miles > 0 && litresSinceLastFull > 0) {
          const gallons = litresSinceLastFull / 4.546;
          raw.push({ mileage: log.mileage, mpg: miles / gallons, date: log.date, fuelLogId: log.id, miles });
        }
      }
      lastFullMileage = log.mileage;
      litresSinceLastFull = 0;
    }
  }

  // Second pass: two independent checks decide whether to trust a
  // segment. A gap much larger than this rider's normal fill-up rhythm
  // is checked FIRST and, unlike the value check, is trusted on its own
  // structural evidence - it doesn't matter what mpg it happens to
  // produce, a gap this size means the segment isn't a reliable single
  // measurement, so it's excluded and the baseline restarts immediately
  // from the next fill-up. Only once a segment clears the gap check
  // does its mpg VALUE get compared to the rider's baseline, the same
  // adaptive statistical check as before.
  const validMpgsSoFar: number[] = [];
  const validGapsSoFar: number[] = [];
  let consecutiveValueAnomalies = 0;
  const result: MpgSegment[] = [];

  for (const seg of raw) {
    const gapFlagged = validGapsSoFar.length >= MIN_VALID_SEGMENTS_FOR_BASELINE && isUnusuallyLargeGap(seg.miles, validGapsSoFar);

    if (gapFlagged) {
      validMpgsSoFar.length = 0;
      validGapsSoFar.length = 0;
      consecutiveValueAnomalies = 0;
      result.push({ mileage: seg.mileage, mpg: seg.mpg, date: seg.date, fuelLogId: seg.fuelLogId, likelyMissedFillUps: true, exclusionReason: "unusual-gap" });
      continue;
    }

    let valueFlagged = validMpgsSoFar.length >= MIN_VALID_SEGMENTS_FOR_BASELINE && isAnomalousValue(seg.mpg, validMpgsSoFar);

    if (valueFlagged) {
      consecutiveValueAnomalies++;
      if (consecutiveValueAnomalies >= CONSECUTIVE_ANOMALIES_RESET_BASELINE) {
        valueFlagged = false;
        validMpgsSoFar.length = 0;
        validGapsSoFar.length = 0;
        consecutiveValueAnomalies = 0;
      }
    } else {
      consecutiveValueAnomalies = 0;
    }

    if (!valueFlagged) {
      validMpgsSoFar.push(seg.mpg);
      validGapsSoFar.push(seg.miles);
    }
    result.push({
      mileage: seg.mileage,
      mpg: seg.mpg,
      date: seg.date,
      fuelLogId: seg.fuelLogId,
      likelyMissedFillUps: valueFlagged,
      exclusionReason: valueFlagged ? "anomalous-value" : undefined,
    });
  }

  return result;
}

// Lifetime average deliberately excludes flagged segments - one missed
// fill-up shouldn't get to drag the number every rider sees on their
// dashboard away from what the bike is actually doing.
export function computeActualMPG(fuelLogs: MpgCalcInput[]): number | null {
  const segments = computeMPGSeries(fuelLogs).filter((s) => !s.likelyMissedFillUps);
  if (segments.length === 0) return null;
  return segments.reduce((sum, s) => sum + s.mpg, 0) / segments.length;
}
