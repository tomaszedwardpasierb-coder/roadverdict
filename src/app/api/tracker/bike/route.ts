// Place at: src/app/api/tracker/bike/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createBike,
  getPrimaryBike,
  updateBikeMileage,
  updateBikeRegion,
  updateBikeBudget,
  updateBikeUnits,
  updateBikeCurrency,
  updateBikeChartType,
  type ChartKind,
} from "@/lib/tracker/bike";
import { getBikeClassForCC } from "@/lib/motorcycleModels";
import type { Region } from "@/lib/priceData";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";
import type { Currency } from "@/lib/tracker/currency";

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
  const result = await createBike(session.email, {
    make,
    model,
    engineCC,
    bikeClass,
    year,
    currentMileage,
    nickname: nickname ?? "",
    region,
  });

  if (!result.ok) {
    // Free-tier cap reached. 403 (not 400) since the request itself is
    // well-formed - it's disallowed by account limits, not bad input.
    return NextResponse.json(
      { error: `Free accounts can track up to ${result.limit} bikes. Upgrade to add more.`, reason: result.reason },
      { status: 403 }
    );
  }

  return NextResponse.json({ bike: result.bike });
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

  const { currentMileage, region, annualBudget, distanceUnit, fuelEconomyUnit, currency, chartType } = body as {
    currentMileage?: number;
    region?: Region;
    annualBudget?: number;
    distanceUnit?: DistanceUnit;
    fuelEconomyUnit?: FuelEconomyUnit;
    currency?: Currency;
    chartType?: { chartId: string; kind: ChartKind };
  };

  if (
    currentMileage == null &&
    !region &&
    annualBudget == null &&
    !distanceUnit &&
    !fuelEconomyUnit &&
    !currency &&
    !chartType
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // No bike-switcher UI yet, so every request acts on the account's
  // primary bike - the same behaviour as before this change for every
  // account that still has exactly one bike (which is every account
  // today, since nothing yet lets someone create a second one).
  const primaryBike = await getPrimaryBike(session.email);
  if (!primaryBike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  const bikeId = primaryBike.id;

  let bike = null;
  if (currentMileage != null) {
    if (currentMileage < 0) {
      return NextResponse.json({ error: "Enter a valid mileage." }, { status: 400 });
    }
    bike = await updateBikeMileage(session.email, bikeId, currentMileage);
  }
  if (region) {
    bike = await updateBikeRegion(session.email, bikeId, region);
  }
  if (annualBudget != null) {
    if (annualBudget <= 0) {
      return NextResponse.json({ error: "Enter a valid budget amount." }, { status: 400 });
    }
    bike = await updateBikeBudget(session.email, bikeId, annualBudget);
  }
  if (distanceUnit || fuelEconomyUnit) {
    bike = await updateBikeUnits(session.email, bikeId, distanceUnit, fuelEconomyUnit);
  }
  if (currency) {
    bike = await updateBikeCurrency(session.email, bikeId, currency);
  }
  if (chartType?.chartId && chartType?.kind) {
    bike = await updateBikeChartType(session.email, bikeId, chartType.chartId, chartType.kind);
  }

  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  return NextResponse.json({ bike });
}
