// Place at: src/lib/tracker/fuelLog.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment } from "./cosmosHelpers";

export interface FuelLogDoc extends TrackerDocBase {
  type: "fuelLog";
  litres: number;
  cost: number;
  mileage: number;
  filledToFull: boolean;
}

export async function createFuelLog(
  email: string,
  data: { bikeId: string; litres: number; cost: number; mileage: number; date: string; filledToFull: boolean; attachments?: Attachment[] }
): Promise<FuelLogDoc> {
  return createTrackerDoc<FuelLogDoc>(email, "fuel", "fuelLog", data);
}

export async function getFuelLogs(email: string, bikeId: string): Promise<FuelLogDoc[]> {
  return queryTrackerDocs<FuelLogDoc>(email, "fuelLog", bikeId);
}

export async function updateFuelLog(
  email: string,
  id: string,
  data: { litres: number; cost: number; mileage: number; date: string; filledToFull: boolean; attachments?: Attachment[] }
): Promise<FuelLogDoc | null> {
  return updateTrackerDoc<FuelLogDoc>(email, id, data);
}

export async function deleteFuelLog(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}

export interface MpgSegment {
  mileage: number;
  mpg: number;
  date: string;
}

export function computeMPGSeries(fuelLogs: FuelLogDoc[]): MpgSegment[] {
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

export function computeActualMPG(fuelLogs: FuelLogDoc[]): number | null {
  const segments = computeMPGSeries(fuelLogs);
  if (segments.length === 0) return null;
  return segments.reduce((sum, s) => sum + s.mpg, 0) / segments.length;
}
