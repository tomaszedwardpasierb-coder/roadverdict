// Place at: src/app/api/tracker/fuel/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateFuelLog, deleteFuelLog } from "@/lib/tracker/fuelLog";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";

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

  const { litres, cost, mileage, date, filledToFull } = body as {
    litres?: number;
    cost?: number;
    mileage?: number;
    date?: string;
    filledToFull?: boolean;
  };

  if (litres == null || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const log = await updateFuelLog(session.email, id, {
    litres,
    cost,
    mileage,
    date,
    filledToFull: Boolean(filledToFull),
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
