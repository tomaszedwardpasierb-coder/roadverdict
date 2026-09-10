// Place at: src/app/api/cars/car/refresh-data/route.ts
//
// Car equivalent of tracker/bike/refresh-data/route.ts - same mechanic
// (re-run the DVLA vehicle-data fetch, MOT import, and tax/SORN check
// for a car that already exists), just against CarDoc. See that file's
// own comment for the full reasoning.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarById, getCurrentRegistration, updateCarDvlaData, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import { fetchDvlaDataFromVdg } from "@/lib/tracker/dvlaDataFetch";
import { importMotHistoryForCar } from "@/lib/tracker/carMotHistoryImport";
import { fetchVehicleTaxDetailsFromVdg } from "@/lib/tracker/vehicleTaxFetch";
import { syncCarSornReminder } from "@/lib/tracker/carReminder";
import { logVedCarBillIfNeeded } from "@/lib/tracker/carBill";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

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
  const { carId } = body as { carId?: string };
  if (!carId) {
    return NextResponse.json({ error: "carId is required." }, { status: 400 });
  }

  // Scoped to the signed-in account's own car - never accepts an email
  // or VRM from the request, same as the bike route.
  const car = await getCarById(session.email, carId);
  if (!car) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const registration = getCurrentRegistration(car);
  if (!registration) {
    return NextResponse.json(
      { error: "This car has no registration on record, so it can't be looked up." },
      { status: 400 }
    );
  }

  let dvlaRefreshed = false;
  try {
    const dvlaData = await fetchDvlaDataFromVdg(registration);
    if (dvlaData) {
      await updateCarDvlaData(session.email, car.id, dvlaData);
      dvlaRefreshed = true;
    }
  } catch (err) {
    console.error("DVLA data refresh failed:", err);
  }

  let motCreated = 0;
  let motSkipped = 0;
  try {
    const result = await importMotHistoryForCar(session.email, car, registration);
    if (!("error" in result)) {
      motCreated = result.createdCount;
      motSkipped = result.skippedCount;
    }
  } catch (err) {
    console.error("MOT refresh failed:", err);
  }

  // taxStatus/taxDueDate are returned even when the car is simply taxed
  // and nothing is wrong - see the equivalent block in the bike route
  // for why (the button surfaces this either way, and silence here is
  // itself a signal that the check didn't run at all).
  let sorned = false;
  let taxStatus: string | null = null;
  let taxDueDate: string | null = null;
  let taxBillLogged = false;
  try {
    const apiKey = process.env.VDG_API_KEY;
    if (apiKey) {
      const taxDetails = await fetchVehicleTaxDetailsFromVdg(registration, apiKey);
      await syncCarSornReminder(session.email, car.id, taxDetails?.taxStatus ?? null, taxDetails?.taxDueDate ?? null);
      // See bill.ts's logVedBillIfNeeded (car equivalent in carBill.ts) -
      // logs the current VED period as a real expense, once per period.
      taxBillLogged = await logVedCarBillIfNeeded(session.email, car.id, taxDetails);
      sorned = taxDetails?.taxStatus?.trim().toUpperCase() === "SORN";
      taxStatus = taxDetails?.taxStatus ?? null;
      taxDueDate = taxDetails?.taxDueDate ?? null;
    }
  } catch (err) {
    console.error("Tax/SORN check failed during refresh:", err);
  }

  if (dvlaRefreshed || motCreated > 0 || taxBillLogged) {
    void logImpersonationActivityForCurrentRequest("car", car.id, "update");
  }
  return NextResponse.json({ ok: true, dvlaRefreshed, motCreated, motSkipped, sorned, taxStatus, taxDueDate, taxBillLogged });
}
