// Place at: src/lib/tracker/carBill.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";
import type { VehicleTaxDetails } from "./vehicleTaxFetch";

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

// Mirrors bill.ts's logVedBillIfNeeded exactly - see its own comment for
// the full reasoning (one bill per inferred tax period, deduped by that
// period's start date, so repeated refreshes never duplicate it).
function taxPeriodStartDate(taxDueDateIso: string): string {
  const due = new Date(taxDueDateIso);
  const start = new Date(Date.UTC(due.getUTCFullYear() - 1, due.getUTCMonth(), due.getUTCDate()));
  return start.toISOString().slice(0, 10);
}

export async function logVedCarBillIfNeeded(email: string, carId: string, taxDetails: VehicleTaxDetails | null): Promise<boolean> {
  if (!taxDetails?.taxIsCurrentlyValid || !taxDetails.taxDueDate) return false;

  const periodStart = taxPeriodStartDate(taxDetails.taxDueDate);
  const existingBills = await getCarBills(email, carId);
  const alreadyLogged = existingBills.some((b) => b.billType === "road-tax" && b.date.slice(0, 10) === periodStart);
  if (alreadyLogged) return false;

  await createCarBill(email, {
    carId,
    billType: "road-tax",
    cost: taxDetails.vedStandardTwelveMonths ?? 0,
    date: periodStart,
    notes: "Auto-logged from a real DVLA tax status check.",
  });
  return true;
}
