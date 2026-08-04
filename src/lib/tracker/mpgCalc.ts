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
  // The fuel log that closed this segment (the later of the two
  // fill-ups the mpg was computed between) - lets the chart link a
  // point back to a specific record instead of just displaying it.
  fuelLogId: string;
  // True when this segment's fuel-per-mile figure is so far from the
  // rider's own baseline that a missed, unlogged fill-up in between is
  // a far more likely explanation than a genuine efficiency change. Kept
  // in the series (not silently dropped) so the caller can show what
  // was excluded and why - but never counted toward any average.
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

// A segment whose mpg is more than this fraction away from the rider's
// own baseline is flagged. 75% is generous on purpose - genuine week-to-
// week variation (motorway vs town, cold starts, a pillion, a full
// pannier) is real and shouldn't get flagged; a fill-up quietly covering
// three unlogged tanks' worth of distance is a much bigger jump than that.
const ANOMALY_THRESHOLD_RATIO = 0.75;
// Need at least this many trustworthy segments before there's a baseline
// worth comparing anything against - the first one or two segments a
// bike ever logs have nothing reliable to be judged against yet.
const MIN_VALID_SEGMENTS_FOR_BASELINE = 2;
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
  // segments whose mpg is wildly out of line with the rider's own
  // baseline instead of taking every logged segment at face value.
  const validMpgsSoFar: number[] = [];
  let consecutiveAnomalies = 0;
  const result: MpgSegment[] = [];

  for (const seg of raw) {
    let flagged = false;
    if (validMpgsSoFar.length >= MIN_VALID_SEGMENTS_FOR_BASELINE) {
      const baseline = median(validMpgsSoFar);
      const deviation = baseline > 0 ? Math.abs(seg.mpg - baseline) / baseline : 0;
      flagged = deviation > ANOMALY_THRESHOLD_RATIO;
    }

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
