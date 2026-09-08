// Place at: src/app/api/tracker/labour/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateLabour, deleteLabour, getLabour, type LabourDoc } from "@/lib/tracker/labour";
import { getBike, getPrimaryBike, updateBikeMileage, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
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
  if (!id.startsWith(`${session.email}::labour::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
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

  const existing = await getTrackerDocById<LabourDoc>(session.email, id);
  const nextMileageConfidence =
    existing?.mileageConfidence === "estimated" || existing?.mileageConfidence === "interpolated"
      ? "confirmed"
      : existing?.mileageConfidence;

  const bikeId = existing?.bikeId;
  const [otherRecords, otherFuelLogs, otherMods, otherLabour] = bikeId
    ? await Promise.all([
        getServiceRecords(session.email, bikeId),
        getFuelLogs(session.email, bikeId),
        getMods(session.email, bikeId),
        getLabour(session.email, bikeId),
      ])
    : [[], [], [], []];
  const bike = await getPrimaryBike(session.email);
  if (bike && isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
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
    bike?.currentMileage ?? mileage,
    id
  );
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  const labour = await updateLabour(session.email, id, {
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
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
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
  if (!id.startsWith(`${session.email}::labour::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const existing = await getTrackerDocById<LabourDoc>(session.email, id);
  if (existing?.bikeId) {
    const bike = await getBike(session.email, existing.bikeId);
    if (bike && isBikeReadOnly(bike)) {
      return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
    }
  }

  await deleteLabour(session.email, id);
  return NextResponse.json({ ok: true });
}
