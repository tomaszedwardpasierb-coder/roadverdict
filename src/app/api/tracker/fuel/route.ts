// Place at: src/app/api/tracker/fuel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createFuelLog, getFuelLogs } from "@/lib/tracker/fuelLog";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getMods } from "@/lib/tracker/mod";
import { findMileageConflict, describeMileageConflict } from "@/lib/tracker/mileageConflict";
import { checkFullTankPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";
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

  const { litres, cost, mileage, date, filledToFull, attachments } = body as {
    litres?: number;
    cost?: number;
    mileage?: number;
    date?: string;
    filledToFull?: boolean;
    attachments?: Attachment[];
  };

  if (litres == null || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  if (isBeforeProduction(date, bike)) {
    return NextResponse.json({ error: `This date is before ${bike.year}, when this bike was made.` }, { status: 400 });
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
  if (conflict) {
    return NextResponse.json({ error: describeMileageConflict(conflict) }, { status: 409 });
  }

  // Same principle as the chronological check, for a different kind of
  // impossibility - a full tank that implies an unrealistic mpg against
  // the nearest earlier trusted fill means the mileage is wrong, not
  // just worth a soft warning.
  if (filledToFull) {
    const trustedFuelLogs = otherFuelLogs
      .filter((f) => !f.mileageConfidence || f.mileageConfidence === "confirmed")
      .map((f) => ({ mileage: f.mileage }));
    const fillCheck = checkFullTankPlausibility(litres, mileage, trustedFuelLogs);
    if (fillCheck && !fillCheck.plausible) {
      return NextResponse.json({ error: describeImplausibleFill(fillCheck, litres) }, { status: 409 });
    }
  }

  const log = await createFuelLog(session.email, {
    bikeId: bike.id,
    litres,
    cost,
    mileage,
    date,
    filledToFull: Boolean(filledToFull),
    attachments,
  });

  if (mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  return NextResponse.json({ log });
}
