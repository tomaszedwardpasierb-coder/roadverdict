// Place at: src/lib/tracker/fine.ts
//
// One-off logged cost, same shape as mod.ts minus mileage - a fine has
// no meaningful "mileage at the time" the way a service or modification
// does, so none of that machinery applies here.
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";

export interface FineDoc extends TrackerDocBase {
  type: "fine";
  fineType: string;
  cost: number;
  notes: string;
}

export async function createFine(
  email: string,
  data: {
    bikeId: string;
    fineType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    currencyConversion?: CurrencyConversionInfo;
  }
): Promise<FineDoc> {
  return createTrackerDoc<FineDoc>(email, "fine", "fine", data);
}

export async function getFines(email: string, bikeId: string): Promise<FineDoc[]> {
  return queryTrackerDocs<FineDoc>(email, "fine", bikeId);
}

export async function updateFine(
  email: string,
  id: string,
  data: {
    fineType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
  }
): Promise<FineDoc | null> {
  return updateTrackerDoc<FineDoc>(email, id, data);
}

export async function deleteFine(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
