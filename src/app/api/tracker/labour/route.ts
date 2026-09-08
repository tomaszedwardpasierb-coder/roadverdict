// Place at: src/app/api/tracker/labour/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createLabour, getLabour } from "@/lib/tracker/labour";
import { getPrimaryBike, updateBikeMileage, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { checkMileageConsistency, describeMileageCheck } from "@/lib/tracker/mileageCheck";
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

  const { category, cost, mileage, date, notes, attachments, mileageAcknowledged } = body as {
    category?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
    attachments?: Attachment[];
    mileageAcknowledged?: boolean;
  };

  if (!category || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const [otherRecords, otherFuelLogs, otherMods, otherLabour] = await Promise.all([
    getServiceRecords(session.email, bike.id),
    getFuelLogs(session.email, bike.id),
    getMods(session.email, bike.id),
    getLabour(session.email, bike.id),
  ]);
  const mileageResult = checkMileageConsistency(
    mileage,
    date,
    [
      ...otherRecords.map((r) => ({ id: r.id, date: r.date, mileage: r.mileage })),
      ...otherFuelLogs.map((f) => ({ id: f.id, date: f.date, mileage: f.mileage })),
      ...otherMods.map((m) => ({ id: m.id, date: m.date, mileage: m.mileage })),
      ...otherLabour.map((l) => ({ id: l.id, date: l.date, mileage: l.mileage })),
    ],
    bike.currentMileage
  );
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  const labour = await createLabour(session.email, {
    bikeId: bike.id,
    category,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    attachments,
  });

  if (mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  return NextResponse.json({ labour });
}
