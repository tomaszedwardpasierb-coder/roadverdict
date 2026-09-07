// Place at: src/lib/tracker/carServiceRecord.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

export interface CarServiceRecordDoc extends TrackerDocBase {
  type: "carServiceRecord";
  carId: string;
  jobType: string;
  cost: number;
  mileage: number;
  notes: string;
  mileageAnomaly?: boolean;
}

export async function createCarServiceRecord(
  email: string,
  data: {
    carId: string;
    jobType: string;
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
): Promise<CarServiceRecordDoc> {
  return createTrackerDoc<CarServiceRecordDoc>(email, "carService", "carServiceRecord", data);
}

export async function getCarServiceRecords(email: string, carId: string): Promise<CarServiceRecordDoc[]> {
  return queryCarTrackerDocs<CarServiceRecordDoc>(email, "carServiceRecord", carId);
}

export async function updateCarServiceRecord(
  email: string,
  id: string,
  data: {
    jobType: string;
    cost: number;
    mileage: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    mileageConfidence?: "interpolated" | "estimated" | "confirmed";
    mileageConflictWarning?: string | null;
  }
): Promise<CarServiceRecordDoc | null> {
  return updateTrackerDoc<CarServiceRecordDoc>(email, id, data);
}

export async function deleteCarServiceRecord(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
