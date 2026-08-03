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
}

export interface MpgCalcInput {
  mileage: number;
  litres: number;
  filledToFull: boolean;
  date: string;
}

export function computeMPGSeries(fuelLogs: MpgCalcInput[]): MpgSegment[] {
  const sorted = [...fuelLogs].sort((a, b) => a.mileage - b.mileage);
  const segments: MpgSegment[] = [];
  let litresSinceLastFull = 0;
  let lastFullMileage: number | null = null;
  for (const log of sorted) {
    litresSinceLastFull += log.litres;
    if (log.filledToFull) {
      if (lastFullMileage !== null) {
        const miles = log.mileage - lastFullMileage;
        if (miles > 0 && litresSinceLastFull > 0) {
          const gallons = litresSinceLastFull / 4.546;
          segments.push({ mileage: log.mileage, mpg: miles / gallons, date: log.date });
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
