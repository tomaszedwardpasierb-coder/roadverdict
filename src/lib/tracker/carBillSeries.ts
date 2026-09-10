// Place at: src/lib/tracker/carBillSeries.ts
//
// Car equivalent of billSeries.ts - same mechanic (a recurring
// instalment plan for insurance/road-tax/finance, materialised lazily
// on read rather than by any cron), just against a CarDoc. queryCarTrackerDocs
// (car.ts) is used instead of queryTrackerDocs for the same reason every
// other car tracker-doc file uses it: the bike version hardcodes
// `c.bikeId`. billSeriesSchedule.ts's own pure schedule/amount math
// (computeDueInstalments, paymentDateForIndex, etc.) is reused directly,
// unchanged - it has zero BikeDoc/CarDoc coupling at all, taking only
// plain {startDate, frequency, collectionDay, ...} shapes.
import { getContainer } from "@/lib/cosmos";
import { createTrackerDoc, updateTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";
import { queryCarTrackerDocs } from "./car";
import {
  computeDueInstalments,
  instalmentNote,
  paymentDateForIndex,
  paymentAmountForIndex,
  type BillSeriesBillType,
  type BillSeriesFrequency,
  type DueInstalment,
} from "./billSeriesSchedule";
import type { CarBillDoc } from "./carBill";

export interface CarBillSeriesDoc extends TrackerDocBase {
  type: "carBillSeries";
  carId: string;
  billType: BillSeriesBillType;
  frequency: BillSeriesFrequency;
  startDate: string;
  collectionDay: number;
  depositAmount?: number;
  instalmentAmount: number;
  instalmentCount: number;
  lastMaterializedIndex: number;
  status: "active" | "completed" | "ended";
  notes?: string;
}

export async function createCarBillSeries(
  email: string,
  data: {
    carId: string;
    billType: BillSeriesBillType;
    frequency: BillSeriesFrequency;
    startDate: string;
    collectionDay: number;
    depositAmount?: number;
    instalmentAmount: number;
    instalmentCount: number;
    notes?: string;
  }
): Promise<CarBillSeriesDoc> {
  return createTrackerDoc<CarBillSeriesDoc>(email, "carBillSeries", "carBillSeries", {
    ...data,
    date: data.startDate,
    lastMaterializedIndex: -1,
    status: "active",
  });
}

export async function getBillSeriesForCar(email: string, carId: string): Promise<CarBillSeriesDoc[]> {
  return queryCarTrackerDocs<CarBillSeriesDoc>(email, "carBillSeries", carId);
}

export async function endCarBillSeries(email: string, id: string): Promise<CarBillSeriesDoc | null> {
  return updateTrackerDoc<CarBillSeriesDoc>(email, id, { status: "ended" });
}

async function upsertMaterializedCarBill(email: string, series: CarBillSeriesDoc, due: DueInstalment): Promise<CarBillDoc> {
  const container = getContainer();
  const doc: CarBillDoc = {
    id: `${email}::carBill::series::${series.id}::${due.index}`,
    pk: email,
    type: "carBill",
    carId: series.carId,
    billType: series.billType,
    cost: due.cost,
    date: due.date,
    notes: instalmentNote(series, due.index),
    seriesId: series.id,
    seriesIndex: due.index,
    source: "auto",
    createdAt: new Date().toISOString(),
  };
  await container.items.upsert(doc);
  return doc;
}

async function materializeInstalments(email: string, series: CarBillSeriesDoc, due: DueInstalment[]): Promise<CarBillDoc[]> {
  if (due.length === 0) return [];

  const created = await Promise.all(due.map((d) => upsertMaterializedCarBill(email, series, d)));

  const newLastIndex = due[due.length - 1].index;
  const completed = newLastIndex === series.instalmentCount - 1;
  await updateTrackerDoc<CarBillSeriesDoc>(email, series.id, {
    lastMaterializedIndex: newLastIndex,
    status: completed ? "completed" : series.status,
  });

  return created;
}

export async function materializeDueInstalments(
  email: string,
  series: CarBillSeriesDoc,
  today: Date = new Date()
): Promise<CarBillDoc[]> {
  return materializeInstalments(email, series, computeDueInstalments(series, today));
}

export async function materializeExactCount(email: string, series: CarBillSeriesDoc, count: number): Promise<CarBillDoc[]> {
  const targetIndex = Math.min(count, series.instalmentCount) - 1;
  if (targetIndex <= series.lastMaterializedIndex) return [];

  const due: DueInstalment[] = [];
  for (let index = series.lastMaterializedIndex + 1; index <= targetIndex; index++) {
    due.push({ index, date: paymentDateForIndex(series, index), cost: paymentAmountForIndex(series, index) });
  }

  return materializeInstalments(email, series, due);
}

export async function materializeAllDueForCar(email: string, carId: string): Promise<void> {
  const series = await getBillSeriesForCar(email, carId);
  const active = series.filter((s) => s.status === "active");
  await Promise.all(active.map((s) => materializeDueInstalments(email, s)));
}
