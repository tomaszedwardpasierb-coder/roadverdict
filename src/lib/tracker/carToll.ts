// Place at: src/lib/tracker/carToll.ts
import { createTrackerDoc, updateTrackerDoc, deleteTrackerDoc, type TrackerDocBase, type Attachment, type CurrencyConversionInfo } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";

export interface CarTollDoc extends TrackerDocBase {
  type: "carToll";
  carId: string;
  tollType: string;
  cost: number;
  notes: string;
}

export async function createCarToll(
  email: string,
  data: {
    carId: string;
    tollType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
    currencyConversion?: CurrencyConversionInfo;
  }
): Promise<CarTollDoc> {
  return createTrackerDoc<CarTollDoc>(email, "carToll", "carToll", data);
}

export async function getCarTolls(email: string, carId: string): Promise<CarTollDoc[]> {
  return queryCarTrackerDocs<CarTollDoc>(email, "carToll", carId);
}

export async function updateCarToll(
  email: string,
  id: string,
  data: {
    tollType: string;
    cost: number;
    date: string;
    notes: string;
    attachments?: Attachment[];
  }
): Promise<CarTollDoc | null> {
  return updateTrackerDoc<CarTollDoc>(email, id, data);
}

export async function deleteCarToll(email: string, id: string): Promise<void> {
  return deleteTrackerDoc(email, id);
}
