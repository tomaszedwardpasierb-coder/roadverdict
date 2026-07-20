// Place at: src/app/api/tracker/fuel/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createFuelLog } from "@/lib/tracker/fuelLog";
import { getBike, updateBikeMileage } from "@/lib/tracker/bike";

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

  const { litres, cost, mileage, date, filledToFull } = body as {
    litres?: number;
    cost?: number;
    mileage?: number;
    date?: string;
    filledToFull?: boolean;
  };

  if (litres == null || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const log = await createFuelLog(session.email, {
    litres,
    cost,
    mileage,
    date,
    filledToFull: Boolean(filledToFull),
  });

  const bike = await getBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, mileage);
  }

  return NextResponse.json({ log });
}
