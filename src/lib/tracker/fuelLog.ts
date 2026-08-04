// Place at: src/lib/tracker/fuelLog.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";

export interface FuelLogDoc extends TrackerDocBase {
  type: "fuelLog";
  litres: number;
  cost: number;
  mileage: number;
  filledToFull: boolean;
}

export async function createFuelLog(
  email: string,
  data: {
    bikeId: string;
    litres: number;
    cost: number;
    mileage: number;
    date: string;
    filledToFull: boolean;
    attachments?: Attachment[];
    needsReview?: boolean;
    currencyConversion?: CurrencyConversionInfo;
    mileageConfidence?: "interpolated" | "estimated";
  }
): Promise<FuelLogDoc> {
  return createTrackerDoc<FuelLogDoc>(email, "fuel", "fuelLog", data);
}

export async function getFuelLogs(email: string, bikeId: string): Promise<FuelLogDoc[]> {
  return queryTrackerDocs<FuelLogDoc>(email, "fuelLog", bikeId);
}

export async function updateFuelLog(
  email: string,
  id: string,
  data: {
    litres: number;
    cost: number;
    mileage: number;
    date: string;
    filledToFull: boolean;
    attachments?: Attachment[];
    needsReview?: boolean;
    mileageConfidence?: "interpolated" | "estimated" | "confirmed";
  }
): Promise<FuelLogDoc | null> {
  return updateTrackerDoc<FuelLogDoc>(email, id, data);
}

export async function deleteFuelLog(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}

// Re-exported from mpgCalc.ts so existing server-side imports
// (dashboard/page.tsx) don't need to change. Any CLIENT component should
// import these directly from mpgCalc.ts instead - that file has zero
// Cosmos dependency, this one does, and importing a value from this file
// pulls the whole SDK into a browser bundle for no reason.
export { computeMPGSeries, computeActualMPG, type MpgSegment } from "./mpgCalc";
