// Place at: src/lib/tracker/carMod.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

export interface CarModDoc extends TrackerDocBase {
  type: "carMod";
  carId: string;
  category: string;
  name: string;
  cost: number;
  mileage: number;
  notes: string;
  mileageAnomaly?: boolean;
}

export async function createCarMod(
  email: string,
  data: {
    carId: string;
    category: string;
    name: string;
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
): Promise<CarModDoc> {
  return createTrackerDoc<CarModDoc>(email, "carMod", "carMod", data);
}

export async function getCarMods(email: string, carId: string): Promise<CarModDoc[]> {
  return queryCarTrackerDocs<CarModDoc>(email, "carMod", carId);
}

export async function updateCarMod(
  email: string,
  id: string,
  data: {
    category: string;
    name: string;
    cost: number;
    mileage: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    mileageConfidence?: "interpolated" | "estimated" | "confirmed";
    mileageConflictWarning?: string | null;
  }
): Promise<CarModDoc | null> {
  return updateTrackerDoc<CarModDoc>(email, id, data);
}

export async function deleteCarMod(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
