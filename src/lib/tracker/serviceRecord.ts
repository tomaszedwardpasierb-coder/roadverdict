// Place at: src/lib/tracker/serviceRecord.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";

export interface ServiceRecordDoc extends TrackerDocBase {
  type: "serviceRecord";
  jobType: string;
  cost: number;
  mileage: number;
  notes: string;
}

export async function createServiceRecord(
  email: string,
  data: {
    bikeId: string;
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
): Promise<ServiceRecordDoc> {
  return createTrackerDoc<ServiceRecordDoc>(email, "service", "serviceRecord", data);
}

export async function getServiceRecords(email: string, bikeId: string): Promise<ServiceRecordDoc[]> {
  return queryTrackerDocs<ServiceRecordDoc>(email, "serviceRecord", bikeId);
}

export async function updateServiceRecord(
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
    // string | null (not just optional) so a fixed conflict can be
    // explicitly cleared on save, not just left stale from before.
    mileageConflictWarning?: string | null;
  }
): Promise<ServiceRecordDoc | null> {
  return updateTrackerDoc<ServiceRecordDoc>(email, id, data);
}

export async function deleteServiceRecord(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
