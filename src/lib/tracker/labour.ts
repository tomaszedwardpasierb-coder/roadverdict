// Place at: src/lib/tracker/labour.ts
//
// Labour - a genuinely new record type, not a Mod/Service variant. Logs
// workshop labour/time cost separately from parts, so it stops getting
// silently folded into "other" or lumped into a Service record's own
// cost figure. Mirrors mod.ts exactly - same generic createTrackerDoc/
// queryTrackerDocs/updateTrackerDoc/deleteTrackerDoc helpers, no changes
// needed there.
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";

export interface LabourDoc extends TrackerDocBase {
  type: "labour";
  // A key into LABOUR_LABELS (labourTypes.ts) - the catalog label IS the
  // description, unlike ModDoc which needs a separate free-text `name`
  // alongside its broader `category` (e.g. "wax" + "Turtle Wax Ice").
  category: string;
  cost: number;
  mileage: number;
  notes: string;
  mileageAnomaly?: boolean;
}

export async function createLabour(
  email: string,
  data: {
    bikeId: string;
    category: string;
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
): Promise<LabourDoc> {
  return createTrackerDoc<LabourDoc>(email, "labour", "labour", data);
}

export async function getLabour(email: string, bikeId: string): Promise<LabourDoc[]> {
  return queryTrackerDocs<LabourDoc>(email, "labour", bikeId);
}

export async function updateLabour(
  email: string,
  id: string,
  data: {
    category: string;
    cost: number;
    mileage: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    needsReview?: boolean;
    mileageConfidence?: "interpolated" | "estimated" | "confirmed";
    mileageConflictWarning?: string | null;
  }
): Promise<LabourDoc | null> {
  return updateTrackerDoc<LabourDoc>(email, id, data);
}

export async function deleteLabour(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
