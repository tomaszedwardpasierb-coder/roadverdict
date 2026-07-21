// Place at: src/app/api/tracker/bike/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createBike,
  updateBikeMileage,
  updateBikeRegion,
  updateBikeBudget,
  updateBikeUnits,
} from "@/lib/tracker/bike";
import { getBikeClassForCC } from "@/lib/motorcycleModels";
import type { Region } from "@/lib/priceData";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";

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

  const { make, model, engineCC, year, currentMileage, nickname, region } = body as {
    make?: string;
    model?: string;
    engineCC?: number;
    year?: number;
    currentMileage?: number;
    nickname?: string;
    region?: Region;
  };

  if (!make || !model || !engineCC || !year || currentMileage == null || !region) {
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
    region,
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

  const { currentMileage, region, annualBudget, distanceUnit, fuelEconomyUnit } = body as {
    currentMileage?: number;
    region?: Region;
    annualBudget?: number;
    distanceUnit?: DistanceUnit;
    fuelEconomyUnit?: FuelEconomyUnit;
  };

  if (currentMileage == null && !region && annualBudget == null && !distanceUnit && !fuelEconomyUnit) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  let bike = null;
  if (currentMileage != null) {
    if (currentMileage < 0) {
      return NextResponse.json({ error: "Enter a valid mileage." }, { status: 400 });
    }
    bike = await updateBikeMileage(session.email, currentMileage);
  }
  if (region) {
    bike = await updateBikeRegion(session.email, region);
  }
  if (annualBudget != null) {
    if (annualBudget <= 0) {
      return NextResponse.json({ error: "Enter a valid budget amount." }, { status: 400 });
    }
    bike = await updateBikeBudget(session.email, annualBudget);
  }
  if (distanceUnit || fuelEconomyUnit) {
    bike = await updateBikeUnits(session.email, distanceUnit, fuelEconomyUnit);
  }

  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  return NextResponse.json({ bike });
}
