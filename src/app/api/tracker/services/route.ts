// Place at: src/app/api/tracker/services/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createServiceRecord } from "@/lib/tracker/serviceRecord";
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

  const { jobType, cost, mileage, date, notes } = body as {
    jobType?: string;
    cost?: number;
    mileage?: number;
    date?: string;
    notes?: string;
  };

  if (!jobType || cost == null || mileage == null || !date) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const record = await createServiceRecord(session.email, {
    jobType,
    cost,
    mileage,
    date,
    notes: notes ?? "",
  });

  // Keep the bike's headline mileage in sync if this entry moves it forward.
  const bike = await getBike(session.email);
  if (bike && mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, mileage);
  }

  return NextResponse.json({ record });
}
