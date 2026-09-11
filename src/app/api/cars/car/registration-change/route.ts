// Place at: src/app/api/cars/car/registration-change/route.ts
// Car mirror of api/tracker/bike/registration-change/route.ts.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarsForUser, addCarRegistrationChange, isCarReadOnly, CAR_READ_ONLY_MESSAGE } from "@/lib/tracker/car";
import type { RegistrationChangeReason } from "@/lib/tracker/bike";
import { logImpersonationActivityForCurrentRequest } from "@/lib/admin/impersonation";

export const dynamic = "force-dynamic";

const VALID_REASONS: RegistrationChangeReason[] = ["private-plate-assigned", "private-plate-removed", "correction", "other"];

// Deliberately its own route, not a plain field edit - a registration
// change is a distinct, audited action with a required reason, appended
// to a permanent history rather than overwriting anything. Takes an
// explicit carId (not "the active car") since this can be triggered
// from the Garage page for any of the account's cars, not just whichever
// one happens to be active right now.
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

  const { carId, plate, reason } = body as { carId?: string; plate?: string; reason?: RegistrationChangeReason };
  if (!carId) {
    return NextResponse.json({ error: "No car specified." }, { status: 400 });
  }
  if (!plate || !plate.trim()) {
    return NextResponse.json({ error: "New registration number is required." }, { status: 400 });
  }
  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Please select a reason for the change." }, { status: 400 });
  }

  const cars = await getCarsForUser(session.email);
  const car = cars.find((c) => c.id === carId);
  if (!car) {
    return NextResponse.json({ error: "Car not found on this account." }, { status: 404 });
  }
  if (isCarReadOnly(car)) {
    return NextResponse.json({ error: CAR_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const updated = await addCarRegistrationChange(session.email, carId, plate.trim().toUpperCase(), reason);
  if (!updated) {
    return NextResponse.json({ error: "Car not found." }, { status: 404 });
  }

  void logImpersonationActivityForCurrentRequest("car", carId, "update");
  return NextResponse.json({ car: updated });
}
