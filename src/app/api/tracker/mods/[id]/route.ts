// Place at: src/app/api/tracker/mods/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateMod, deleteMod } from "@/lib/tracker/mod";
import { getBike, updateBikeMileage } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::mod::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { category, name, cost, mileage, date, notes } = body as {
    category?: string;
    name?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
  };

  if (!category || !name || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const mod = await updateMod(session.email, id, { category, name, cost, mileage, date, notes: notes ?? "" });
  if (!mod) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const bike = await getBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, mileage);
  }

  return NextResponse.json({ mod });
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const id = decodeURIComponent(params.id);
  if (!id.startsWith(`${session.email}::mod::`)) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  await deleteMod(session.email, id);
  return NextResponse.json({ ok: true });
}
