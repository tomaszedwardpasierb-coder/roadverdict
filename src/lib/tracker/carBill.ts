// Place at: src/lib/tracker/carBill.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

export interface CarBillDoc extends TrackerDocBase {
  type: "carBill";
  carId: string;
  billType: string;
  cost: number;
  notes: string;
  // Optional, additive - set only on an mot-test bill imported from MOT
  // history, same rationale as BillDoc's own field of the same name.
  mileage?: number;
  // Optional, additive - set only on a bill that belongs to a recurring
  // instalment plan (see carBillSeries.ts). Mirrors BillDoc's own fields
  // of the same name exactly.
  seriesId?: string;
  seriesIndex?: number;
  source?: "manual" | "auto";
}

export async function createCarBill(
  email: string,
  data: {
    carId: string;
    billType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    currencyConversion?: CurrencyConversionInfo;
    aiDescription?: string;
    mileage?: number;
  }
): Promise<CarBillDoc> {
  return createTrackerDoc<CarBillDoc>(email, "carBill", "carBill", data);
}

export async function getCarBills(email: string, carId: string): Promise<CarBillDoc[]> {
  return queryCarTrackerDocs<CarBillDoc>(email, "carBill", carId);
}

export async function updateCarBill(
  email: string,
  id: string,
  data: { billType: string; cost: number; date: string; notes: string; attachments?: Attachment[]; needsReview?: boolean; mileage?: number }
): Promise<CarBillDoc | null> {
  return updateTrackerDoc<CarBillDoc>(email, id, data);
}

export async function deleteCarBill(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
