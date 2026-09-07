// Place at: src/app/api/cars/car-fuel/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarFuelLog, deleteCarFuelLog, getCarFuelLogs, type CarFuelLogDoc } from "@/lib/tracker/carFuelLog";
import { getCarById, getPrimaryCar, updateCarMileage, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarMods } from "@/lib/tracker/carMod";
import { checkMileageConsistency, describeMileageCheck } from "@/lib/tracker/mileageCheck";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
import { getTrackerDocById, type Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carFuel::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { litres, kwh, cost, mileage, date, filledToFull, attachments, batchHints, mileageAcknowledged, mileageAnomaly } = body as {
    litres?: number;
    kwh?: number;
    cost?: number;
    mileage?: number;
    date?: string;
    filledToFull?: boolean;
    attachments?: Attachment[];
    batchHints?: { date: string; mileage: number }[];
    mileageAcknowledged?: boolean;
    mileageAnomaly?: boolean;
  };

  const existing = await getTrackerDocById<CarFuelLogDoc>(session.email, id);
  const isElectric = existing?.fuelType === "electric";
  const amount = isElectric ? kwh : litres;
  if (amount == null || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const nextMileageConfidence =
    existing?.mileageConfidence === "estimated" || existing?.mileageConfidence === "interpolated"
      ? "confirmed"
      : existing?.mileageConfidence;

  const carId = existing?.carId;
  const [otherRecords, otherFuelLogs, otherMods] = carId
    ? await Promise.all([getCarServiceRecords(session.email, carId), getCarFuelLogs(session.email, carId), getCarMods(session.email, carId)])
    : [[], [], []];
  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }
  const mileageResult = checkMileageConsistency(
    mileage,
    date,
    [
      ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
      ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
      ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
      ...(batchHints ?? []),
    ],
    car?.currentMileage ?? mileage,
    id
  );
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  if (!isElectric && filledToFull) {
    const fillCheck = checkFullTankPlausibility(
      amount,
      mileage,
      otherFuelLogs
        .filter((f) => f.id !== id && (!f.mileageConfidence || f.mileageConfidence === "confirmed"))
        .map((f) => ({ mileage: f.mileage }))
    );
    if (fillCheck && !fillCheck.plausible) {
      return NextResponse.json({ error: describeImplausibleFill(fillCheck, amount) }, { status: 409 });
    }
  }

  const log = await updateCarFuelLog(session.email, id, {
    fuelType: existing?.fuelType ?? "petrol",
    litres: isElectric ? undefined : amount,
    kwh: isElectric ? amount : undefined,
    cost,
    mileage,
    date,
    filledToFull: isElectric ? undefined : filledToFull,
    ...(attachments !== undefined ? { attachments } : {}),
    needsReview: false,
    mileageConfidence: nextMileageConfidence,
    mileageConflictWarning: null,
    ...(mileageAnomaly !== undefined ? { mileageAnomaly } : {}),
  });
  if (!log) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  if (car && mileage > car.currentMileage) {
    await updateCarMileage(session.email, car.id, mileage);
  }

  return NextResponse.json({ log });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carFuel::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const existing = await getTrackerDocById<CarFuelLogDoc>(session.email, id);
  if (existing?.carId) {
    const car = await getCarById(session.email, existing.carId);
    if (car && isCarReadOnly(car)) {
      return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
    }
  }

  await deleteCarFuelLog(session.email, id);
  return NextResponse.json({ ok: true });
}
