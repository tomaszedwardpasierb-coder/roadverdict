// Place at: src/lib/tracker/carFuelLog.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs, type CarFuelType } from "./car";

// litres for ICE/hybrid fill-ups, kwh for EV charging sessions - never
// both, and which one is present is decided by the car's own fuelType,
// not by anything the caller has to track separately here.
export interface CarFuelLogDoc extends TrackerDocBase {
  type: "carFuelLog";
  carId: string;
  fuelType: CarFuelType;
  litres?: number;
  kwh?: number;
  cost: number;
  mileage: number;
  // Only meaningful for ICE/hybrid fill-ups - a charging session has no
  // equivalent concept, so this stays undefined for electric entries
  // rather than being forced to a meaningless false.
  filledToFull?: boolean;
  mileageAnomaly?: boolean;
}

export async function createCarFuelLog(
  email: string,
  data: {
    carId: string;
    fuelType: CarFuelType;
    litres?: number;
    kwh?: number;
    cost: number;
    mileage: number;
    date: string;
    filledToFull?: boolean;
    attachments?: Attachment[];
    needsReview?: boolean;
    currencyConversion?: CurrencyConversionInfo;
    mileageConfidence?: "interpolated" | "estimated";
    aiDescription?: string;
    mileageConflictWarning?: string;
  }
): Promise<CarFuelLogDoc> {
  return createTrackerDoc<CarFuelLogDoc>(email, "carFuel", "carFuelLog", data);
}

export async function getCarFuelLogs(email: string, carId: string): Promise<CarFuelLogDoc[]> {
  return queryCarTrackerDocs<CarFuelLogDoc>(email, "carFuelLog", carId);
}

export async function updateCarFuelLog(
  email: string,
  id: string,
  data: {
    fuelType: CarFuelType;
    litres?: number;
    kwh?: number;
    cost: number;
    mileage: number;
    date: string;
    filledToFull?: boolean;
    attachments?: Attachment[];
    needsReview?: boolean;
    mileageConfidence?: "interpolated" | "estimated" | "confirmed";
    mileageConflictWarning?: string | null;
  }
): Promise<CarFuelLogDoc | null> {
  return updateTrackerDoc<CarFuelLogDoc>(email, id, data);
}

export async function deleteCarFuelLog(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
