// Place at: src/app/api/cars/car/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createCar,
  getPrimaryCar,
  getCarsForUser,
  countActiveCars,
  updateCarMileage,
  updateCarRegion,
  updateCarBudget,
  updateCarUnits,
  updateCarCurrency,
  updateCarChartType,
  updateCarDvlaData,
  updateCarIncludeInsuranceInReport,
  updateCarIncludeFinanceInReport,
  isCarReadOnly,
  CAR_READ_ONLY_MESSAGE,
  type CarFuelType,
} from "@/lib/tracker/car";
import { getBikesForUser, countActiveBikes, type ChartKind } from "@/lib/tracker/bike";
import { isPro } from "@/lib/subscriptions";
import { MAX_FREE_VEHICLES } from "@/lib/tracker/vehicleLimit";
import { fetchDvlaDataFromVdg } from "@/lib/tracker/dvlaDataFetch";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";
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

  const { make, model, fuelType, engineLitres, batteryKwh, year, isCustomBuild, registration, currentMileage, nickname, region, mayHavePriorHistory } = body as {
    make?: string;
    model?: string;
    fuelType?: CarFuelType;
    engineLitres?: number;
    batteryKwh?: number;
    year?: number;
    isCustomBuild?: boolean;
    registration?: string;
    currentMileage?: number;
    nickname?: string;
    region?: Region;
    mayHavePriorHistory?: boolean;
  };

  if (!make || !model || !fuelType || currentMileage == null || !region) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  // Engine size only makes sense for something with an engine - an
  // electric car has none, so it's the one fuel type this doesn't apply to.
  if (fuelType !== "electric" && !engineLitres) {
    return NextResponse.json({ error: "Engine size is required for this fuel type." }, { status: 400 });
  }
  // Production year is skippable the same way it already is for a
  // custom-build motorcycle, plus electric cars - both are cases where
  // "year of manufacture" is either meaningless or genuinely unclear.
  if (!isCustomBuild && fuelType !== "electric" && !year) {
    return NextResponse.json({ error: "Production year is required for this fuel type, unless this is a custom build." }, { status: 400 });
  }
  if (!registration || !registration.trim()) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  // Combined bike+car cap - createCar itself has no cap logic of its own
  // (unlike createBike), so this route is the only gate for cars. See
  // the equivalent block in POST /api/tracker/bike for why this lives
  // at the route layer rather than inside car.ts.
  if (!(await isPro(session.email))) {
    const [existingBikes, existingCars] = await Promise.all([
      getBikesForUser(session.email),
      getCarsForUser(session.email),
    ]);
    const combinedCount = countActiveBikes(existingBikes) + countActiveCars(existingCars);
    if (combinedCount >= MAX_FREE_VEHICLES) {
      return NextResponse.json(
        {
          error: `Free accounts can track up to ${MAX_FREE_VEHICLES} vehicles total (bikes and cars combined). Upgrade to add more.`,
          reason: "limit_reached",
        },
        { status: 403 }
      );
    }
  }

  const car = await createCar(session.email, {
    make,
    model,
    fuelType,
    engineLitres: fuelType === "electric" ? undefined : engineLitres,
    batteryKwh,
    year: isCustomBuild ? undefined : year,
    isCustomBuild,
    registration: registration.trim().toUpperCase(),
    currentMileage,
    nickname: nickname ?? "",
    region,
    mayHavePriorHistory,
  });

  // Best-effort, non-blocking - same convention as bike creation. A
  // failed or empty lookup never stops the car from being created.
  try {
    const dvlaData = await fetchDvlaDataFromVdg(car.originalRegistration ?? "");
    if (dvlaData) {
      await updateCarDvlaData(session.email, car.id, dvlaData);
      car.dvlaData = dvlaData;
    }
  } catch (err) {
    console.error("DVLA data fetch failed during car creation:", err);
  }

  void logImpersonationActivityForCurrentRequest("car", car.id, "create");
  return NextResponse.json({ car });
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

  const { currentMileage, region, annualBudget, distanceUnit, fuelEconomyUnit, currency, chartType, includeInsuranceInReport, includeFinanceInReport } = body as {
    currentMileage?: number;
    region?: Region;
    annualBudget?: number;
    distanceUnit?: DistanceUnit;
    fuelEconomyUnit?: FuelEconomyUnit;
    currency?: Currency;
    chartType?: { chartId: string; kind: ChartKind };
    includeInsuranceInReport?: boolean;
    includeFinanceInReport?: boolean;
  };

  if (
    currentMileage == null &&
    !region &&
    annualBudget == null &&
    !distanceUnit &&
    !fuelEconomyUnit &&
    !currency &&
    !chartType &&
    includeInsuranceInReport === undefined &&
    includeFinanceInReport === undefined
  ) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const primaryCar = await getPrimaryCar(session.email);
  if (!primaryCar) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }
  // Car ownership transfer itself isn't built yet (see the ADR), so
  // transferredTo never actually gets set today - this check exists so
  // the write path is already correct the day it does.
  if (isCarReadOnly(primaryCar)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }
  const carId = primaryCar.id;

  let car = null;
  if (currentMileage != null) {
    if (currentMileage < 0) {
      return NextResponse.json({ error: "Enter a valid mileage." }, { status: 400 });
    }
    car = await updateCarMileage(session.email, carId, currentMileage);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (region) {
    car = await updateCarRegion(session.email, carId, region);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (annualBudget != null) {
    if (annualBudget <= 0) {
      return NextResponse.json({ error: "Enter a valid budget amount." }, { status: 400 });
    }
    car = await updateCarBudget(session.email, carId, annualBudget);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (distanceUnit || fuelEconomyUnit) {
    car = await updateCarUnits(session.email, carId, distanceUnit, fuelEconomyUnit);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (currency) {
    car = await updateCarCurrency(session.email, carId, currency);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (chartType?.chartId && chartType?.kind) {
    car = await updateCarChartType(session.email, carId, chartType.chartId, chartType.kind);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (includeInsuranceInReport !== undefined) {
    car = await updateCarIncludeInsuranceInReport(session.email, carId, includeInsuranceInReport);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }
  if (includeFinanceInReport !== undefined) {
    car = await updateCarIncludeFinanceInReport(session.email, carId, includeFinanceInReport);
    void logImpersonationActivityForCurrentRequest("car", carId, "update");
  }

  if (!car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }

  return NextResponse.json({ car });
}
