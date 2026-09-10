// Place at: src/app/api/cars/car-bill-series/route.ts
// Car mirror of api/tracker/bill-series/route.ts. BILL_SERIES_ELIGIBLE_TYPES
// is reused directly from billTypes.ts - genuinely vehicle-neutral (a
// plain array of billType strings, no BikeDoc/CarDoc coupling).
// isBeforeProduction is reused directly for the same reason.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarBillSeries, materializeDueInstalments, materializeExactCount } from "@/lib/tracker/carBillSeries";
import { seriesEndDate, type BillSeriesBillType, type BillSeriesFrequency } from "@/lib/tracker/billSeriesSchedule";
import { createCarReminder, deleteCarRemindersBySourceKey } from "@/lib/tracker/carReminder";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { CAR_BILL_LABELS } from "@/lib/tracker/carBillTypes";
import { BILL_SERIES_ELIGIBLE_TYPES } from "@/lib/tracker/billTypes";

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
  if (billType === "road-tax" && depositAmount != null) {
    return NextResponse.json({ error: "Road tax instalment plans don't have a deposit." }, { status: 400 });
  }

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }
  if (isBeforeProduction(startDate, car)) {
    return NextResponse.json({ error: `This date is before ${car.year}, when this car was made.` }, { status: 400 });
  }

  const series = await createCarBillSeries(session.email, {
    carId: car.id,
    billType: billType as BillSeriesBillType,
    frequency: frequency as BillSeriesFrequency,
    startDate,
    collectionDay,
    depositAmount: billType === "insurance" || billType === "finance" ? depositAmount : undefined,
    instalmentAmount,
    instalmentCount,
    notes,
  });

  if (instalmentsAlreadyPaid != null && instalmentsAlreadyPaid > 0) {
    await materializeExactCount(session.email, series, instalmentsAlreadyPaid);
  } else {
    await materializeDueInstalments(session.email, series);
  }

  const sourceKey = `bill-series:${series.id}`;
  await deleteCarRemindersBySourceKey(session.email, car.id, sourceKey);
  await createCarReminder(session.email, {
    carId: car.id,
    name: `${CAR_BILL_LABELS[billType] ?? billType} plan renewal`,
    intervalType: "date",
    exactDate: seriesEndDate(series),
    baseMileage: car.currentMileage,
    date: startDate,
    sourceKey,
  });

  return NextResponse.json({ series });
}
