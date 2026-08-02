// Place at: src/app/api/tracker/mods/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createMod } from "@/lib/tracker/mod";
import { getPrimaryBike, updateBikeMileage } from "@/lib/tracker/bike";

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

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  const mod = await createMod(session.email, { bikeId: bike.id, category, name, cost, mileage, date, notes: notes ?? "" });

  if (mileage > bike.currentMileage) {
    await updateBikeMileage(session.email, bike.id, mileage);
  }

  return NextResponse.json({ mod });
}
