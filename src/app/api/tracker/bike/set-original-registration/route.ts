// Place at: src/app/api/tracker/bike/set-original-registration/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike, setOriginalRegistration, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

// One-time backfill for accounts that added a bike before registration
// tracking existed. Deliberately its own route, not folded into the
// general bike PATCH - this can only ever set the field once, never edit
// it, and keeping it separate makes that plain rather than looking like
// just another field update.
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

  const { registration } = body as { registration?: string };
  if (!registration || !registration.trim()) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
  }

  const result = await setOriginalRegistration(session.email, bike.id, registration.trim().toUpperCase());
  if (!result.ok) {
    if (result.reason === "already_set") {
      return NextResponse.json({ error: "This bike already has a registration on record and it can't be changed here." }, { status: 409 });
    }
    return NextResponse.json({ error: "Bike not found." }, { status: 404 });
  }

  return NextResponse.json({ bike: result.bike });
}
