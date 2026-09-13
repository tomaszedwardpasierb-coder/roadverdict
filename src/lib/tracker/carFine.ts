// Place at: src/lib/tracker/carFine.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

export interface CarFineDoc extends TrackerDocBase {
  type: "carFine";
  carId: string;
  fineType: string;
  cost: number;
  notes: string;
}

export async function createCarFine(
  email: string,
  data: {
    carId: string;
    fineType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    currencyConversion?: CurrencyConversionInfo;
  }
): Promise<CarFineDoc> {
  return createTrackerDoc<CarFineDoc>(email, "carFine", "carFine", data);
}

export async function getCarFines(email: string, carId: string): Promise<CarFineDoc[]> {
  return queryCarTrackerDocs<CarFineDoc>(email, "carFine", carId);
}

export async function updateCarFine(
  email: string,
  id: string,
  data: {
    fineType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
  }
): Promise<CarFineDoc | null> {
  return updateTrackerDoc<CarFineDoc>(email, id, data);
}

export async function deleteCarFine(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
