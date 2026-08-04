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
}

export interface MpgCalcInput {
  id: string;
  mileage: number;
  litres: number;
  filledToFull: boolean;
  date: string;
  mileageConfidence?: "interpolated" | "estimated" | "confirmed";
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
  const segments: MpgSegment[] = [];
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
          segments.push({ mileage: log.mileage, mpg: miles / gallons, date: log.date, fuelLogId: log.id });
        }
      }
      lastFullMileage = log.mileage;
      litresSinceLastFull = 0;
    }
  }
  return segments;
}

export function computeActualMPG(fuelLogs: MpgCalcInput[]): number | null {
  const segments = computeMPGSeries(fuelLogs);
  if (segments.length === 0) return null;
  return segments.reduce((sum, s) => sum + s.mpg, 0) / segments.length;
}
