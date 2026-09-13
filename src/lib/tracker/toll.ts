// Place at: src/lib/tracker/toll.ts
//
// One-off logged cost, identical shape to fine.ts - see that file's own
// comment for why there's no mileage field.
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";

export interface TollDoc extends TrackerDocBase {
  type: "toll";
  tollType: string;
  cost: number;
  notes: string;
}

export async function createToll(
  email: string,
  data: {
    bikeId: string;
    tollType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    currencyConversion?: CurrencyConversionInfo;
  }
): Promise<TollDoc> {
  return createTrackerDoc<TollDoc>(email, "toll", "toll", data);
}

export async function getTolls(email: string, bikeId: string): Promise<TollDoc[]> {
  return queryTrackerDocs<TollDoc>(email, "toll", bikeId);
}

export async function updateToll(
  email: string,
  id: string,
  data: {
    tollType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
  }
): Promise<TollDoc | null> {
  return updateTrackerDoc<TollDoc>(email, id, data);
}

export async function deleteToll(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
