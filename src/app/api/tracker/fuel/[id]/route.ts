// Place at: src/app/api/tracker/fuel/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateFuelLog, deleteFuelLog, getFuelLogs, type FuelLogDoc } from "@/lib/tracker/fuelLog";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { findMileageConflict, describeMileageConflict } from "@/lib/tracker/mileageConflict";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
import { getTrackerDocById, type Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::fuel::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { litres, cost, mileage, date, filledToFull, attachments, batchHints } = body as {
    litres?: number;
    cost?: number;
    mileage?: number;
    date?: string;
    filledToFull?: boolean;
    attachments?: Attachment[];
    batchHints?: { date: string; mileage: number }[];
  };

  if (litres == null || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const existing = await getTrackerDocById<FuelLogDoc>(session.email, id);
  const nextMileageConfidence =
    existing?.mileageConfidence === "estimated" || existing?.mileageConfidence === "interpolated"
      ? "confirmed"
      : existing?.mileageConfidence;

  const bikeId = existing?.bikeId;
  const [otherRecords, otherFuelLogs, otherMods] = bikeId
    ? await Promise.all([getServiceRecords(session.email, bikeId), getFuelLogs(session.email, bikeId), getMods(session.email, bikeId)])
    : [[], [], []];
  const conflict = findMileageConflict(date, mileage, id, [
    ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
    ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
    ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
    ...(batchHints ?? []),
  ]);
  if (conflict) {
    return NextResponse.json({ error: describeMileageConflict(conflict) }, { status: 409 });
  }

  if (filledToFull) {
    const trustedFuelLogs = otherFuelLogs
      .filter((f) => f.id !== id)
      .filter((f) => !f.mileageConfidence || f.mileageConfidence === "confirmed")
      .map((f) => ({ mileage: f.mileage }));
    const fillCheck = checkFullTankPlausibility(litres, mileage, trustedFuelLogs);
    if (fillCheck && !fillCheck.plausible) {
      return NextResponse.json({ error: describeImplausibleFill(fillCheck, litres) }, { status: 409 });
    }
  }

  const log = await updateFuelLog(session.email, id, {
    litres,
    cost,
    mileage,
    date,
    filledToFull: Boolean(filledToFull),
    attachments,
    needsReview: false,
    mileageConfidence: nextMileageConfidence,
    mileageConflictWarning: null,
  });
  if (!log) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  return NextResponse.json({ log });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::fuel::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  await deleteFuelLog(session.email, id);
  return NextResponse.json({ ok: true });
}
