// Place at: src/lib/tracker/serviceRecord.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";

export interface ServiceRecordDoc extends TrackerDocBase {
  type: "serviceRecord";
  jobType: string;
  cost: number;
  mileage: number;
  notes: string;
}

export async function createServiceRecord(
  email: string,
  data: { jobType: string; cost: number; mileage: number; date: string; notes: string }
): Promise<ServiceRecordDoc> {
  return createTrackerDoc<ServiceRecordDoc>(email, "service", "serviceRecord", data);
}

export async function getServiceRecords(email: string): Promise<ServiceRecordDoc[]> {
  return queryTrackerDocs<ServiceRecordDoc>(email, "serviceRecord");
}

export async function updateServiceRecord(
  email: string,
  id: string,
  data: { jobType: string; cost: number; mileage: number; date: string; notes: string }
): Promise<ServiceRecordDoc | null> {
  return updateTrackerDoc<ServiceRecordDoc>(email, id, data);
}

export async function deleteServiceRecord(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
