// Place at: src/app/api/cars/car-mods/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarMod, deleteCarMod, getCarMods, type CarModDoc } from "@/lib/tracker/carMod";
import { getCarById, getPrimaryCar, updateCarMileage, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
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
  if (!id.startsWith(`${session.email}::carMod::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { category, name, cost, mileage, date, notes, attachments, batchHints, mileageAcknowledged, mileageAnomaly } = body as {
    category?: string;
    name?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    batchHints?: { date: string; mileage: number }[];
    mileageAcknowledged?: boolean;
    mileageAnomaly?: boolean;
  };

  if (!category || !name || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const existing = await getTrackerDocById<CarModDoc>(session.email, id);
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

  const mod = await updateCarMod(session.email, id, {
    category,
    name,
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
  if (!mod) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  if (car && mileage > car.currentMileage) {
    await updateCarMileage(session.email, car.id, mileage);
  }

  return NextResponse.json({ mod });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carMod::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const existing = await getTrackerDocById<CarModDoc>(session.email, id);
  if (existing?.carId) {
    const car = await getCarById(session.email, existing.carId);
    if (car && isCarReadOnly(car)) {
      return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
    }
  }

  await deleteCarMod(session.email, id);
  return NextResponse.json({ ok: true });
}
