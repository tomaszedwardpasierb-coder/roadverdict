// Place at: src/lib/tracker/carLabour.ts
//
// Car equivalent of labour.ts - sister schema, mirrors carMod.ts exactly.
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

export interface CarLabourDoc extends TrackerDocBase {
  type: "carLabour";
  carId: string;
  category: string;
  cost: number;
  mileage: number;
  notes: string;
  mileageAnomaly?: boolean;
}

export async function createCarLabour(
  email: string,
  data: {
    carId: string;
    category: string;
    cost: number;
    mileage: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    currencyConversion?: CurrencyConversionInfo;
    mileageConfidence?: "interpolated" | "estimated";
    aiDescription?: string;
    mileageConflictWarning?: string;
  }
): Promise<CarLabourDoc> {
  return createTrackerDoc<CarLabourDoc>(email, "carLabour", "carLabour", data);
}

export async function getCarLabour(email: string, carId: string): Promise<CarLabourDoc[]> {
  return queryCarTrackerDocs<CarLabourDoc>(email, "carLabour", carId);
}

export async function updateCarLabour(
  email: string,
  id: string,
  data: {
    category: string;
    cost: number;
    mileage: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    mileageConfidence?: "interpolated" | "estimated" | "confirmed";
    mileageConflictWarning?: string | null;
  }
): Promise<CarLabourDoc | null> {
  return updateTrackerDoc<CarLabourDoc>(email, id, data);
}

export async function deleteCarLabour(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
