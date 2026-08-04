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
// Two flagged segments in a row, both off in roughly the same direction
// from the SAME stale baseline, reads as a genuine sustained change
// (different bike, new commute, different riding style) rather than a
// one-off missed fill-up - a real missed fill-up is a single blip, not
// a run of them. When this happens, stop treating them as errors and
// let the baseline restart from here.
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

function isAnomalous(candidate: number, baselineValues: number[]): boolean {
  const baseline = median(baselineValues);
  if (baseline <= 0) return false;

  if (baselineValues.length < MIN_SEGMENTS_FOR_ADAPTIVE_METHOD) {
    return Math.abs(candidate - baseline) / baseline > EARLY_FALLBACK_DEVIATION_RATIO;
  }

  const mad = medianAbsoluteDeviation(baselineValues, baseline);
  if (mad > baseline * MIN_MAD_TO_BASELINE_RATIO) {
    const modifiedZ = (MAD_SCALE_CONSTANT * (candidate - baseline)) / mad;
    return Math.abs(modifiedZ) > MODIFIED_ZSCORE_THRESHOLD;
  }
  return Math.abs(candidate - baseline) / baseline > EARLY_FALLBACK_DEVIATION_RATIO;
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
  const raw: { mileage: number; mpg: number; date: string; fuelLogId: string }[] = [];
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
          raw.push({ mileage: log.mileage, mpg: miles / gallons, date: log.date, fuelLogId: log.id });
        }
      }
      lastFullMileage = log.mileage;
      litresSinceLastFull = 0;
    }
  }

  // Second pass: a missed, unlogged fill-up between two logged ones
  // makes the segment that follows look far more fuel-efficient than
  // it really was - the litres logged only cover what actually got
  // logged, not the real fuel burned over that whole distance. Flag
  // segments whose mpg is a statistical outlier against the rider's own
  // history instead of taking every logged segment at face value.
  const validMpgsSoFar: number[] = [];
  let consecutiveAnomalies = 0;
  const result: MpgSegment[] = [];

  for (const seg of raw) {
    let flagged = validMpgsSoFar.length >= MIN_VALID_SEGMENTS_FOR_BASELINE && isAnomalous(seg.mpg, validMpgsSoFar);

    if (flagged) {
      consecutiveAnomalies++;
      if (consecutiveAnomalies >= CONSECUTIVE_ANOMALIES_RESET_BASELINE) {
        // Looks sustained, not a one-off - stop excluding these and
        // start a fresh baseline from this segment onward.
        flagged = false;
        validMpgsSoFar.length = 0;
        consecutiveAnomalies = 0;
      }
    } else {
      consecutiveAnomalies = 0;
    }

    if (!flagged) validMpgsSoFar.push(seg.mpg);
    result.push({ ...seg, likelyMissedFillUps: flagged });
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
