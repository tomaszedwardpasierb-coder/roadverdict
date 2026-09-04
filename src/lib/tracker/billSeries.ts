// Place at: src/lib/tracker/billSeries.ts
//
// A recurring instalment plan for insurance or road tax (never MOT - that's
// always a one-off). No cron/scheduled job materialises these - due
// instalments are computed and written the moment someone reads this
// bike's bills (dashboard load, buyer report, CSV export), via
// materializeDueInstalments/materializeAllDueForBike below. Once written,
// a materialised instalment is a normal, confirmed BillDoc - there's no
// "pending confirmation" state for it.
import { getContainer } from "@/lib/cosmos";
import { createTrackerDoc, queryTrackerDocs, updateTrackerDoc, type TrackerDocBase } from "./cosmosHelpers";
import { computeDueInstalments, instalmentNote, type BillSeriesBillType, type BillSeriesFrequency, type DueInstalment } from "./billSeriesSchedule";
import type { BillDoc } from "./bill";

export interface BillSeriesDoc extends TrackerDocBase {
  type: "billSeries";
  billType: BillSeriesBillType;
  frequency: BillSeriesFrequency;
  // ISO date of the first payment - the deposit, for an insurance plan.
  startDate: string;
  // 1-28: day of month collection lands on for every payment AFTER the
  // first. Capped at 28 so it's valid in every month, including February.
  collectionDay: number;
  // Insurance only. Omitted (rather than defaulting it to instalmentAmount
  // here) so "no deposit" is representable and the amount actually
  // charged is never silently invented.
  depositAmount?: number;
  instalmentAmount: number;
  // Total number of payments in the whole plan, INCLUDING the deposit if
  // there is one - index 0 is the first payment (the deposit, for
  // insurance that has one), indices 1..instalmentCount-1 are the regular
  // instalmentAmount payments. Deliberately not "regular instalments
  // after the deposit" - a split definition that changes meaning between
  // insurance and road tax is exactly the kind of thing that causes an
  // off-by-one bug later.
  instalmentCount: number;
  // Monotonically increasing, never decremented - the highest instalment
  // index ever materialised for this series. This is what makes
  // materialisation safe against a deleted instalment silently
  // reappearing: the check is "have we EVER created index N", not "does a
  // bill for index N currently exist". -1 means nothing materialised yet.
  lastMaterializedIndex: number;
  status: "active" | "completed" | "ended";
  notes?: string;
}

export async function createBillSeries(
  email: string,
  data: {
    bikeId: string;
    billType: BillSeriesBillType;
    frequency: BillSeriesFrequency;
    startDate: string;
    collectionDay: number;
    depositAmount?: number;
    instalmentAmount: number;
    instalmentCount: number;
    notes?: string;
  }
): Promise<BillSeriesDoc> {
  return createTrackerDoc<BillSeriesDoc>(email, "billSeries", "billSeries", {
    ...data,
    date: data.startDate,
    lastMaterializedIndex: -1,
    status: "active",
  });
}

export async function getBillSeriesForBike(email: string, bikeId: string): Promise<BillSeriesDoc[]> {
  return queryTrackerDocs<BillSeriesDoc>(email, "billSeries", bikeId);
}

export async function endBillSeries(email: string, id: string): Promise<BillSeriesDoc | null> {
  return updateTrackerDoc<BillSeriesDoc>(email, id, { status: "ended" });
}

// Writes a materialised instalment with a DETERMINISTIC id (keyed on
// series id + instalment index), not the usual timestamp-based id every
// other tracker doc gets. This is what makes materialisation safe under
// a race (two concurrent dashboard loads both deciding the same
// instalment is due): both upserts land on the exact same document
// instead of creating two duplicate bills, with no DB-level unique
// constraint required.
async function upsertMaterializedBill(email: string, series: BillSeriesDoc, due: DueInstalment): Promise<BillDoc> {
  const container = getContainer();
  const doc: BillDoc = {
    id: `${email}::bill::series::${series.id}::${due.index}`,
    pk: email,
    type: "bill",
    bikeId: series.bikeId,
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

// The actual read-triggers-write step. Materialises whatever's due,
// advances lastMaterializedIndex past every instalment just created
// (whether or not a human later deletes one - deletion never rewinds
// this counter, which is what stops a deleted instalment reappearing on
// the next read), and flips the series to "completed" once its final
// instalment has been materialised.
export async function materializeDueInstalments(
  email: string,
  series: BillSeriesDoc,
  today: Date = new Date()
): Promise<BillDoc[]> {
  const due = computeDueInstalments(series, today);
  if (due.length === 0) return [];

  const created = await Promise.all(due.map((d) => upsertMaterializedBill(email, series, d)));

  const newLastIndex = due[due.length - 1].index;
  const completed = newLastIndex === series.instalmentCount - 1;
  await updateTrackerDoc<BillSeriesDoc>(email, series.id, {
    lastMaterializedIndex: newLastIndex,
    status: completed ? "completed" : series.status,
  });

  return created;
}

// Call this once, right before reading a bike's bills, from every place
// that shows them to a person (dashboard, buyer report, CSV export) - see
// each call site for why. Scoped to one bike's own active series, so this
// is always a cheap single-partition read, never a batch job.
export async function materializeAllDueForBike(email: string, bikeId: string): Promise<void> {
  const series = await getBillSeriesForBike(email, bikeId);
  const active = series.filter((s) => s.status === "active");
  await Promise.all(active.map((s) => materializeDueInstalments(email, s)));
}

// Re-exported so existing server-side imports don't need two import
// lines - see billSeriesSchedule.ts's own header for why any CLIENT
// component should import these directly from there instead.
export { paymentDateForIndex, paymentAmountForIndex, instalmentNote, seriesEndDate, seriesTotalCost, computeDueInstalments } from "./billSeriesSchedule";
export type { BillSeriesBillType, BillSeriesFrequency, DueInstalment } from "./billSeriesSchedule";
