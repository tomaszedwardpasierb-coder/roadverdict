// Place at: src/lib/tracker/bill.ts
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import type { VehicleTaxDetails } from "./vehicleTaxFetch";

export interface BillDoc extends TrackerDocBase {
  type: "bill";
  billType: string;
  cost: number;
  notes: string;
  // Optional, additive - only ever set on mot-test bills imported from
  // MOT history, where DVSA's own odometer reading doubles as a genuine
  // mileage anchor point. Existing bills simply have none.
  mileage?: number;
  // Optional, additive - set only on a bill that belongs to a recurring
  // instalment plan (see billSeries.ts). seriesIndex is 0 for the first/
  // deposit payment, incrementing from there. Existing bills, and any
  // one-off bill logged the normal way, simply have neither field.
  seriesId?: string;
  seriesIndex?: number;
  // Default 'manual' in effect (i.e. whenever absent) - 'auto' only for
  // an instalment written by materializeDueInstalments, never by a
  // normal "Log it" submission.
  source?: "manual" | "auto";
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
    aiDescription?: string;
    mileage?: number;
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
  data: { billType: string; cost: number; date: string; notes: string; attachments?: Attachment[]; needsReview?: boolean; mileage?: number }
): Promise<BillDoc | null> {
  return updateTrackerDoc<BillDoc>(email, id, data);
}

export async function deleteBill(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}

// A real, DVLA-confirmed tax period is a genuine expense worth logging
// automatically - same spirit as importMotHistoryForBike auto-logging
// mot-test bills, just for VED instead. Deliberately one bill PER TAX
// PERIOD, not per refresh: VDG's tax-status package only ever gives a
// current snapshot (TaxDueDate, TaxIsCurrentlyValid), never a history of
// past payments the way MOT tests come as a real list of dated events -
// so the period this bill represents is inferred as the 12 months
// ending on taxDueDate (the only rate VDG gives us is
// VehicleExciseDutyDetails.VedRate.Standard.TwelveMonths - there's no
// signal to reason about a 6-monthly payer or a first-year rate
// instead). That inferred start date doubles as the dedup key: refreshing
// again while the same period is still current finds the bill already
// logged and does nothing, so clicking "Refresh vehicle data" repeatedly
// never creates duplicates - a new one only appears once taxDueDate
// itself rolls over to the next period.
function taxPeriodStartDate(taxDueDateIso: string): string {
  const due = new Date(taxDueDateIso);
  const start = new Date(Date.UTC(due.getUTCFullYear() - 1, due.getUTCMonth(), due.getUTCDate()));
  return start.toISOString().slice(0, 10);
}

// Returns true when a new bill was actually created (false when the
// vehicle isn't currently taxed, has no due date to anchor a period to,
// or this period's bill already exists).
export async function logVedBillIfNeeded(email: string, bikeId: string, taxDetails: VehicleTaxDetails | null): Promise<boolean> {
  if (!taxDetails?.taxIsCurrentlyValid || !taxDetails.taxDueDate) return false;

  const periodStart = taxPeriodStartDate(taxDetails.taxDueDate);
  const existingBills = await getBills(email, bikeId);
  const alreadyLogged = existingBills.some((b) => b.billType === "road-tax" && b.date.slice(0, 10) === periodStart);
  if (alreadyLogged) return false;

  await createBill(email, {
    bikeId,
    billType: "road-tax",
    cost: taxDetails.vedStandardTwelveMonths ?? 0,
    date: periodStart,
    notes: "Auto-logged from a real DVLA tax status check.",
  });
  return true;
}
