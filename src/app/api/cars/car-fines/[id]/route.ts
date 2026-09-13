// Place at: src/app/api/cars/car-fines/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateCarFine, deleteCarFine } from "@/lib/tracker/carFine";
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
  if (!id.startsWith(`${session.email}::carFine::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { fineType, cost, date, notes, attachments } = body as {
    fineType?: string;
    cost?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
  };

  if (!fineType || cost == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const fine = await updateCarFine(session.email, id, {
    fineType,
    cost,
    date,
    notes: notes ?? "",
    ...(attachments !== undefined ? { attachments } : {}),
  });
  if (!fine) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  return NextResponse.json({ fine });
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::carFine::`)) {
    return NextResponse.json({ error: "Record not found." }, { status: 404 });
  }

  const car = await getPrimaryCar(session.email);
  if (car && isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  await deleteCarFine(session.email, id);
  return NextResponse.json({ ok: true });
}
