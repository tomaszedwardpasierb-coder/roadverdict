// Place at: src/app/api/tracker/bike/registration-change/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikesForUser, addRegistrationChange, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE, type RegistrationChangeReason } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

const VALID_REASONS: RegistrationChangeReason[] = ["private-plate-assigned", "private-plate-removed", "correction", "other"];

// Deliberately its own route, not a plain field edit - a registration
// change is a distinct, audited action with a required reason, appended
// to a permanent history rather than overwriting anything. Takes an
// explicit bikeId (not "the active bike") since this can be triggered
// from the Garage page for any of the account's bikes, not just whichever
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

  const { bikeId, plate, reason } = body as { bikeId?: string; plate?: string; reason?: RegistrationChangeReason };
  if (!bikeId) {
    return NextResponse.json({ error: "No bike specified." }, { status: 400 });
  }
  if (!plate || !plate.trim()) {
    return NextResponse.json({ error: "New registration number is required." }, { status: 400 });
  }
  if (!reason || !VALID_REASONS.includes(reason)) {
    return NextResponse.json({ error: "Please select a reason for the change." }, { status: 400 });
  }

  const bikes = await getBikesForUser(session.email);
  const bike = bikes.find((b) => b.id === bikeId);
  if (!bike) {
    return NextResponse.json({ error: "Bike not found on this account." }, { status: 404 });
  }
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const updated = await addRegistrationChange(session.email, bikeId, plate.trim().toUpperCase(), reason);
  if (!updated) {
    return NextResponse.json({ error: "Bike not found." }, { status: 404 });
  }

  return NextResponse.json({ bike: updated });
}
