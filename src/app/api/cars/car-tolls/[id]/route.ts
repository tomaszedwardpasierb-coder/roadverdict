// Place at: src/app/api/cars/car-tolls/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarToll, deleteCarToll } from "@/lib/tracker/carToll";
import { getPrimaryCar, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carToll::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { tollType, cost, date, notes, attachments } = body as {
    tollType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
  };

  if (!tollType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const toll = await updateCarToll(session.email, id, {
    tollType,
    cost,
    date,
    notes: notes ?? "",
    ...(attachments !== undefined ? { attachments } : {}),
  });
  if (!toll) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  return NextResponse.json({ toll });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carToll::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  await deleteCarToll(session.email, id);
  return NextResponse.json({ ok: true });
}
