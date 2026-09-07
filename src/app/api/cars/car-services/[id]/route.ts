// Place at: src/app/api/cars/car-services/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarServiceRecord, deleteCarServiceRecord, getCarServiceRecords, type CarServiceRecordDoc } from "@/lib/tracker/carServiceRecord";
import { getCarById, getPrimaryCar, updateCarMileage, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { createCarReminder, deleteCarRemindersBySourceKey } from "@/lib/tracker/carReminder";
import { CAR_JOB_LABELS } from "@/lib/tracker/carJobTypes";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { checkMileageConsistency, describeMileageCheck } from "@/lib/tracker/mileageCheck";
import { getTrackerDocById, type Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carService::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { jobType, cost, mileage, date, notes, attachments, reminder, batchHints, mileageAcknowledged, mileageAnomaly } = body as {
    jobType?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    reminder?: {
      intervalType: "mileage" | "months" | "date";
      intervalValue?: number;
      exactDate?: string;
      additionalTriggers?: { intervalType: "mileage" | "months" | "date"; intervalValue?: number; exactDate?: string }[];
    };
    batchHints?: { date: string; mileage: number }[];
    mileageAcknowledged?: boolean;
    mileageAnomaly?: boolean;
  };

  if (!jobType || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const existing = await getTrackerDocById<CarServiceRecordDoc>(session.email, id);
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

  const record = await updateCarServiceRecord(session.email, id, {
    jobType,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    ...(attachments !== undefined ? { attachments } : {}),
    needsReview: false,
    mileageConfidence: nextMileageConfidence,
    mileageConflictWarning: null,
    ...(mileageAnomaly !== undefined ? { mileageAnomaly } : {}),
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  if (car && mileage > car.currentMileage) {
    await updateCarMileage(session.email, car.id, mileage);
  }

  if (reminder && car) {
    const sourceKey = `carService:${jobType}`;
    await deleteCarRemindersBySourceKey(session.email, car.id, sourceKey);
    await createCarReminder(session.email, {
      carId: car.id,
      name: CAR_JOB_LABELS[jobType] ?? jobType,
      intervalType: reminder.intervalType,
      intervalValue: reminder.intervalValue,
      exactDate: reminder.exactDate,
      additionalTriggers: reminder.additionalTriggers,
      baseMileage: mileage,
      date,
      sourceKey,
    });
  }

  return NextResponse.json({ record });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carService::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const existing = await getTrackerDocById<CarServiceRecordDoc>(session.email, id);
  if (existing?.carId) {
    const car = await getCarById(session.email, existing.carId);
    if (car && isCarReadOnly(car)) {
      return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
    }
  }

  await deleteCarServiceRecord(session.email, id);
  return NextResponse.json({ ok: true });
}
