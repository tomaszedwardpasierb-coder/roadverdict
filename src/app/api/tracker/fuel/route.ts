// Place at: src/app/api/tracker/fuel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createFuelLog } from "@/lib/tracker/fuelLog";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";
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
