// Place at: src/app/api/tracker/bill-series/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBillSeries, materializeDueInstalments, materializeExactCount, seriesEndDate, type BillSeriesBillType, type BillSeriesFrequency } from "@/lib/tracker/billSeries";
import { createReminder, deleteRemindersBySourceKey } from "@/lib/tracker/reminder";
import { getPrimaryBike, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { BILL_LABELS, BILL_SERIES_ELIGIBLE_TYPES } from "@/lib/tracker/billTypes";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { billType, frequency, startDate, collectionDay, depositAmount, instalmentAmount, instalmentCount, notes, instalmentsAlreadyPaid } = body as {
    billType?: string;
    frequency?: string;
    startDate?: string;
    collectionDay?: number;
    depositAmount?: number;
    instalmentAmount?: number;
    instalmentCount?: number;
    notes?: string;
    // Backdating a plan that's already been running a while - lets the
    // owner state directly how many payments they've actually made,
    // rather than trusting collection-day arithmetic against today's
    // date to infer it (see materializeExactCount's own comment for why
    // that inference can be wrong).
    instalmentsAlreadyPaid?: number;
  };

  if (!billType || !(BILL_SERIES_ELIGIBLE_TYPES as readonly string[]).includes(billType)) {
    return NextResponse.json({ error: "This bill type can't be logged as an instalment plan." }, { status: 400 });
  }
  if (frequency !== "monthly" && frequency !== "six-monthly") {
    return NextResponse.json({ error: "Please choose how often payments are collected." }, { status: 400 });
  }
  if (!startDate || collectionDay == null || instalmentAmount == null || instalmentCount == null) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  if (collectionDay < 1 || collectionDay > 28) {
    return NextResponse.json({ error: "Collection day must be between 1 and 28." }, { status: 400 });
  }
  if (instalmentCount < 1) {
    return NextResponse.json({ error: "A plan needs at least one payment." }, { status: 400 });
  }
  if (instalmentsAlreadyPaid != null && (instalmentsAlreadyPaid < 0 || instalmentsAlreadyPaid > instalmentCount)) {
    return NextResponse.json({ error: "Instalments already paid can't be negative or more than the total number of payments." }, { status: 400 });
  }
  // Road tax has no deposit concept - DVLA's monthly/6-monthly VED is
  // equal instalments plus a flat surcharge, never a front-loaded first
  // payment, so silently accepting one here would let a plan represent
  // something that doesn't exist in the real scheme.
  if (billType === "road-tax" && depositAmount != null) {
    return NextResponse.json({ error: "Road tax instalment plans don't have a deposit." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }
  if (isBeforeProduction(startDate, bike)) {
    return NextResponse.json({ error: `This date is before ${bike.year}, when this bike was made.` }, { status: 400 });
  }

  const series = await createBillSeries(session.email, {
    bikeId: bike.id,
    billType: billType as BillSeriesBillType,
    frequency: frequency as BillSeriesFrequency,
    startDate,
    collectionDay,
    // Insurance premium finance and vehicle finance (HP/PCP) both
    // commonly front-load a deposit; road tax never does (rejected
    // above before reaching here), so this is the only other type that
    // can ever carry one.
    depositAmount: billType === "insurance" || billType === "finance" ? depositAmount : undefined,
    instalmentAmount,
    instalmentCount,
    notes,
  });

  // Explicit count takes priority over date arithmetic when backdating
  // a plan that's already been running a while - it's the owner's own
  // stated fact about what's actually happened, not an inference.
  // Without it, materialise whatever's due as of today immediately, so
  // the first payment appears right away - the same felt behaviour as
  // logging a one-off bill today, rather than making someone wait for a
  // page reload or a cron that doesn't exist.
  if (instalmentsAlreadyPaid != null && instalmentsAlreadyPaid > 0) {
    await materializeExactCount(session.email, series, instalmentsAlreadyPaid);
  } else {
    await materializeDueInstalments(session.email, series);
  }

  // Anchored to the plan's natural end date, not a fixed months-from-now
  // offset - one renewal reminder per series, in the same sourceKey
  // namespace as "end this plan" so ending it can find and clear it.
  const sourceKey = `bill-series:${series.id}`;
  await deleteRemindersBySourceKey(session.email, bike.id, sourceKey);
  await createReminder(session.email, {
    bikeId: bike.id,
    name: `${BILL_LABELS[billType] ?? billType} plan renewal`,
    intervalType: "date",
    exactDate: seriesEndDate(series),
    baseMileage: bike.currentMileage,
    date: startDate,
    sourceKey,
  });

  return NextResponse.json({ series });
}
