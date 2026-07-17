// Place at: src/app/api/tracker/bike/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBike, updateBikeMileage } from "@/lib/tracker/bike";
import { getBikeClassForCC } from "@/lib/motorcycleModels";

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

  const { make, model, engineCC, year, currentMileage, nickname } = body as {
    make?: string;
    model?: string;
    engineCC?: number;
    year?: number;
    currentMileage?: number;
    nickname?: string;
  };

  if (!make || !model || !engineCC || !year || currentMileage == null) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }

  const bikeClass = getBikeClassForCC(engineCC);
  const bike = await createBike(session.email, {
    make,
    model,
    engineCC,
    bikeClass,
    year,
    currentMileage,
    nickname: nickname ?? "",
  });

  return NextResponse.json({ bike });
}

export async function PATCH(request: NextRequest) {
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

  const { currentMileage } = body as { currentMileage?: number };
  if (currentMileage == null || currentMileage < 0) {
    return NextResponse.json({ error: "Enter a valid mileage." }, { status: 400 });
  }

  const bike = await updateBikeMileage(session.email, currentMileage);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  return NextResponse.json({ bike });
}
