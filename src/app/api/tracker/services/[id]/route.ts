// Place at: src/app/api/tracker/services/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateServiceRecord, deleteServiceRecord } from "@/lib/tracker/serviceRecord";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::service::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { jobType, cost, mileage, date, notes } = body as {
    jobType?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
  };

  if (!jobType || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const record = await updateServiceRecord(session.email, id, {
    jobType,
    cost,
    mileage,
    date,
    notes: notes ?? "",
  });
  if (!record) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  return NextResponse.json({ record });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::service::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  await deleteServiceRecord(session.email, id);
  return NextResponse.json({ ok: true });
}
