// Place at: src/app/api/tracker/bike/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  createBike,
  getPrimaryBike,
  getBikesForUser,
  countActiveBikes,
  updateBikeMileage,
  updateBikeRegion,
  updateBikeBudget,
  updateBikeUnits,
  updateBikeCurrency,
  updateBikeIncludeInsuranceInReport,
  updateBikeIncludeFinanceInReport,
  updateBikeChartType,
  updateBikeDvlaData,
  isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE,
  type ChartKind,
} from "@/lib/tracker/bike";
import { getCarsForUser, countActiveCars } from "@/lib/tracker/car";
import { isPro } from "@/lib/subscriptions";
import { MAX_FREE_VEHICLES } from "@/lib/tracker/vehicleLimit";
import { fetchDvlaDataFromVdg } from "@/lib/tracker/dvlaDataFetch";
import { fetchVehicleTaxDetailsFromVdg } from "@/lib/tracker/vehicleTaxFetch";
import { syncSornReminder } from "@/lib/tracker/reminder";
import { logVedBillIfNeeded } from "@/lib/tracker/bill";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";
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

  const { make, model, engineCC, year, isCustomBuild, registration, currentMileage, nickname, region, mayHavePriorHistory } = body as {
    make?: string;
    model?: string;
    engineCC?: number;
    year?: number;
    isCustomBuild?: boolean;
    registration?: string;
    currentMileage?: number;
    nickname?: string;
    region?: Region;
    mayHavePriorHistory?: boolean;
  };

  if (!make || !model || !engineCC || currentMileage == null || !region) {
    return NextResponse.json({ error: "Please fill in all required fields." }, { status: 400 });
  }
  if (!isCustomBuild && !year) {
    return NextResponse.json({ error: "Production year is required, unless this is a custom build." }, { status: 400 });
  }
  if (!registration || !registration.trim()) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  // Combined bike+car cap, checked here rather than inside createBike
  // itself - bike.ts can't count cars without importing car.ts's
  // runtime code, which this app's sister-schema architecture never
  // does. createBike's own internal (bike-only) cap check stays as an
  // inner safety net below, but is never actually reachable through this
  // route once this fires, since a bike-only count can never exceed the
  // combined count.
  if (!(await isPro(session.email))) {
    const [existingBikes, existingCars] = await Promise.all([
      getBikesForUser(session.email),
      getCarsForUser(session.email),
    ]);
    const combinedCount = countActiveBikes(existingBikes) + countActiveCars(existingCars);
    if (combinedCount >= MAX_FREE_VEHICLES) {
      return NextResponse.json(
        {
          error: `Free accounts can track up to ${MAX_FREE_VEHICLES} vehicle${MAX_FREE_VEHICLES === 1 ? "" : "s"} total (bikes and cars combined). Upgrade to add more.`,
          reason: "limit_reached",
        },
        { status: 403 }
      );
    }
  }

  const bikeClass = getBikeClassForCC(engineCC);
  const result = await createBike(session.email, {
    make,
    model,
    engineCC,
    bikeClass,
    year: isCustomBuild ? undefined : year,
    isCustomBuild,
    registration: registration.trim().toUpperCase(),
    currentMileage,
    nickname: nickname ?? "",
    region,
    mayHavePriorHistory,
  });

  if (!result.ok) {
    // Free-tier cap reached. 403 (not 400) since the request itself is
    // well-formed - it's disallowed by account limits, not bad input.
    return NextResponse.json(
      { error: `Free accounts can track up to ${result.limit} bike${result.limit === 1 ? "" : "s"}. Upgrade to add more.`, reason: result.reason },
      { status: 403 }
    );
  }

  // Best-effort, non-blocking - a failed or empty lookup never stops the
  // bike from being created successfully. Reuses the same VehicleDetails
  // call plate-lookup already makes, just keeping more of the response
  // this time instead of discarding everything past make/model/year.
  try {
    const dvlaData = await fetchDvlaDataFromVdg(result.bike.originalRegistration ?? "");
    if (dvlaData) {
      await updateBikeDvlaData(session.email, result.bike.id, dvlaData);
      result.bike.dvlaData = dvlaData;
    }
  } catch (err) {
    console.error("DVLA data fetch failed during bike creation:", err);
  }

  // Same best-effort, non-blocking treatment as the DVLA fetch above, kept
  // in its own try/catch so a tax-lookup failure never affects the DVLA
  // result. A SORN'd vehicle gets a permanent reminder immediately, rather
  // than only being discovered the first time someone clicks "Refresh
  // vehicle data" - see reminder.ts's syncSornReminder.
  try {
    const apiKey = process.env.VDG_API_KEY;
    if (apiKey) {
      const taxDetails = await fetchVehicleTaxDetailsFromVdg(result.bike.originalRegistration ?? "", apiKey);
      await syncSornReminder(session.email, result.bike.id, taxDetails?.taxStatus ?? null);
      // A confirmed-taxed vehicle also gets its current VED period
      // logged as a real expense right away - see bill.ts's
      // logVedBillIfNeeded.
      await logVedBillIfNeeded(session.email, result.bike.id, taxDetails);
    }
  } catch (err) {
    console.error("Tax/SORN check failed during bike creation:", err);
  }

  void logImpersonationActivityForCurrentRequest("bike", result.bike.id, "create");
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

  // No bike-switcher UI yet, so every request acts on the account's
  // primary bike - the same behaviour as before this change for every
  // account that still has exactly one bike (which is every account
  // today, since nothing yet lets someone create a second one).
  const primaryBike = await getPrimaryBike(session.email);
  if (!primaryBike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (isBikeReadOnly(primaryBike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }
  const bikeId = primaryBike.id;

  let bike = null;
  if (currentMileage != null) {
    if (currentMileage < 0) {
      return NextResponse.json({ error: "Enter a valid mileage." }, { status: 400 });
    }
    bike = await updateBikeMileage(session.email, bikeId, currentMileage);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (region) {
    bike = await updateBikeRegion(session.email, bikeId, region);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (annualBudget != null) {
    if (annualBudget <= 0) {
      return NextResponse.json({ error: "Enter a valid budget amount." }, { status: 400 });
    }
    bike = await updateBikeBudget(session.email, bikeId, annualBudget);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (distanceUnit || fuelEconomyUnit) {
    bike = await updateBikeUnits(session.email, bikeId, distanceUnit, fuelEconomyUnit);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (currency) {
    bike = await updateBikeCurrency(session.email, bikeId, currency);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (chartType?.chartId && chartType?.kind) {
    bike = await updateBikeChartType(session.email, bikeId, chartType.chartId, chartType.kind);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (includeInsuranceInReport !== undefined) {
    bike = await updateBikeIncludeInsuranceInReport(session.email, bikeId, includeInsuranceInReport);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }
  if (includeFinanceInReport !== undefined) {
    bike = await updateBikeIncludeFinanceInReport(session.email, bikeId, includeFinanceInReport);
    void logImpersonationActivityForCurrentRequest("bike", bikeId, "update");
  }

  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  return NextResponse.json({ bike });
}
