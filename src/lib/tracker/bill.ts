// Place at: src/lib/tracker/bill.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";

export interface BillDoc extends TrackerDocBase {
  type: "bill";
  billType: string;
  cost: number;
  notes: string;
}

export async function createBill(
  email: string,
  data: {
    bikeId: string;
    billType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    currencyConversion?: CurrencyConversionInfo;
  }
): Promise<BillDoc> {
  return createTrackerDoc<BillDoc>(email, "bill", "bill", data);
}

export async function getBills(email: string, bikeId: string): Promise<BillDoc[]> {
  return queryTrackerDocs<BillDoc>(email, "bill", bikeId);
}

export async function updateBill(
  email: string,
  id: string,
  data: { billType: string; cost: number; date: string; notes: string; attachments?: Attachment[]; needsReview?: boolean }
): Promise<BillDoc | null> {
  return updateTrackerDoc<BillDoc>(email, id, data);
}

export async function deleteBill(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
