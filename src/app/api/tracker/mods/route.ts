// Place at: src/app/api/tracker/mods/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createMod, getMods } from "@/lib/tracker/mod";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { findMileageConflict, describeMileageConflict } from "@/lib/tracker/mileageConflict";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { category, name, cost, mileage, date, notes, attachments, mileageAcknowledged } = body as {
    category?: string;
    name?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    mileageAcknowledged?: boolean;
  };

  if (!category || !name || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  const [otherRecords, otherFuelLogs, otherMods] = await Promise.all([
    getServiceRecords(session.email, bike.id),
    getFuelLogs(session.email, bike.id),
    getMods(session.email, bike.id),
  ]);
  const conflict = findMileageConflict(date, mileage, null, [
    ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
    ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
    ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
  ]);
  if (conflict && !mileageAcknowledged) {
    return NextResponse.json({ error: describeMileageConflict(conflict) }, { status: 409 });
  }

  const mod = await createMod(session.email, {
    bikeId: bike.id,
    category,
    name,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    attachments,
  });

  if (mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  return NextResponse.json({ mod });
}
