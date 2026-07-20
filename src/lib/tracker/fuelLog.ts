// Place at: src/lib/tracker/fuelLog.ts
import { getContainer } from "@/lib/cosmos";

export interface FuelLogDoc {
  id: string;
  pk: string;
  type: "fuelLog";
  litres: number;
  cost: number;
  mileage: number;
  date: string;
  filledToFull: boolean;
  createdAt: string;
}

export async function createFuelLog(
  email: string,
  data: { litres: number; cost: number; mileage: number; date: string; filledToFull: boolean }
): Promise<FuelLogDoc> {
  const container = getContainer();
  const doc: FuelLogDoc = {
    id: `${email}::fuel::${Date.now()}`,
    pk: email,
    type: "fuelLog",
    litres: data.litres,
    cost: data.cost,
    mileage: data.mileage,
    date: data.date,
    filledToFull: data.filledToFull,
    createdAt: new Date().toISOString(),
  };
  await container.items.upsert(doc);
  return doc;
}

export async function getFuelLogs(email: string): Promise<FuelLogDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<FuelLogDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'fuelLog' ORDER BY c.date DESC" },
      { partitionKey: email }
    )
    .fetchAll();
  return resources;
}

export interface MpgSegment {
  mileage: number;
  mpg: number;
}

// Real MPG from actual fill-ups, not the site-wide 57mpg assumption used
// in the Cost Calculator. Only valid between two consecutive "filled to
// full" entries - partial fills in between just accumulate litres used.
// Same methodology fuel-tracking apps like Fuelly use.
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
          segments.push({ mileage: log.mileage, mpg: miles / gallons });
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
