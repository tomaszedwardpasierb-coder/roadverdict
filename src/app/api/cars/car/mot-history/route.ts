// Place at: src/app/api/cars/car/mot-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarById, getCurrentRegistration } from "@/lib/tracker/car";
import { importMotHistoryForCar } from "@/lib/tracker/carMotHistoryImport";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { canRunVehicleLookup, recordVehicleLookupRun } from "@/lib/tracker/vehicleLookupCooldown";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const lookupUser = await getUserDoc(session.email);
  if (!canRunVehicleLookup(lookupUser)) {
    return NextResponse.json({ error: "Please wait a few seconds before trying again." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { carId } = body as { carId?: string };
  if (!carId) {
    return NextResponse.json({ error: "carId is required." }, { status: 400 });
  }

  const car = await getCarById(session.email, carId);
  if (!car) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  const registration = getCurrentRegistration(car);
  if (!registration) {
    return NextResponse.json(
      { error: "This car has no registration on record, so it can't be looked up." },
      { status: 400 }
    );
  }

  const result = await importMotHistoryForCar(session.email, car, registration);
  await recordVehicleLookupRun(session.email);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  void logImpersonationActivityForCurrentRequest("car", carId, "update");
  return NextResponse.json(result);
}
