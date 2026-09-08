// Place at: src/app/api/cars/car-labour/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarLabour, deleteCarLabour, getCarLabour, type CarLabourDoc } from "@/lib/tracker/carLabour";
import { getCarById, getPrimaryCar, updateCarMileage, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
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
  if (!id.startsWith(`${session.email}::carLabour::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { category, cost, mileage, date, notes, attachments, batchHints, mileageAcknowledged, mileageAnomaly } = body as {
    category?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    batchHints?: { date: string; mileage: number }[];
    mileageAcknowledged?: boolean;
    mileageAnomaly?: boolean;
  };

  if (!category || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const existing = await getTrackerDocById<CarLabourDoc>(session.email, id);
  const nextMileageConfidence =
    existing?.mileageConfidence === "estimated" || existing?.mileageConfidence === "interpolated"
      ? "confirmed"
      : existing?.mileageConfidence;

  const carId = existing?.carId;
  const [otherRecords, otherFuelLogs, otherMods, otherLabour] = carId
    ? await Promise.all([
        getCarServiceRecords(session.email, carId),
        getCarFuelLogs(session.email, carId),
        getCarMods(session.email, carId),
        getCarLabour(session.email, carId),
      ])
    : [[], [], [], []];
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
      ...otherLabour.map((l) => ({ id: l.id, date: l.date, mileage: l.mileage })),
      ...(batchHints ?? []),
    ],
    car?.currentMileage ?? mileage,
    id
  );
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  const labour = await updateCarLabour(session.email, id, {
    category,
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
  if (!labour) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  if (car && mileage > car.currentMileage) {
    await updateCarMileage(session.email, car.id, mileage);
  }

  return NextResponse.json({ labour });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carLabour::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const existing = await getTrackerDocById<CarLabourDoc>(session.email, id);
  if (existing?.carId) {
    const car = await getCarById(session.email, existing.carId);
    if (car && isCarReadOnly(car)) {
      return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
    }
  }

  await deleteCarLabour(session.email, id);
  return NextResponse.json({ ok: true });
}
