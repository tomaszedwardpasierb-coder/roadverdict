// Place at: src/app/api/tracker/mods/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { updateMod, deleteMod, type ModDoc } from "@/lib/tracker/mod";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { getTrackerDocById, type Attachment } from "@/lib/tracker/cosmosHelpers";

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

  const { category, name, cost, mileage, date, notes, attachments } = body as {
    category?: string;
    name?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
  };

  if (!category || !name || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const existing = await getTrackerDocById<ModDoc>(session.email, id);
  const nextMileageConfidence =
    existing?.mileageConfidence === "estimated" || existing?.mileageConfidence === "interpolated"
      ? "confirmed"
      : existing?.mileageConfidence;

  const mod = await updateMod(session.email, id, {
    category,
    name,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    attachments,
    needsReview: false,
    mileageConfidence: nextMileageConfidence,
  });
  if (!mod) {
    return NextResponse.json({ error: "Entry not found." }, { status: 404 });
  }

  const bike = await getPrimaryBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
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
