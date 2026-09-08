// Place at: src/app/api/cars/car-labour/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createCarLabour, getCarLabour } from "@/lib/tracker/carLabour";
import { getPrimaryCar, updateCarMileage, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
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

  const car = await getPrimaryCar(session.email);
  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const [otherRecords, otherFuelLogs, otherMods, otherLabour] = await Promise.all([
    getCarServiceRecords(session.email, car.id),
    getCarFuelLogs(session.email, car.id),
    getCarMods(session.email, car.id),
    getCarLabour(session.email, car.id),
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
    car.currentMileage
  );
  if (mileageResult.status === "blocked" || (mileageResult.status === "warning" && !mileageAcknowledged)) {
    return NextResponse.json({ error: describeMileageCheck(mileageResult) }, { status: 409 });
  }

  const labour = await createCarLabour(session.email, {
    carId: car.id,
    category,
    cost,
    mileage,
    date,
    notes: notes ?? "",
    attachments,
  });

  if (mileage > car.currentMileage) {
    await updateCarMileage(session.email, car.id, mileage);
  }

  return NextResponse.json({ labour });
}
