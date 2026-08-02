// Place at: src/app/api/tracker/active-bike/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBikesForUser, ACTIVE_BIKE_COOKIE } from "@/lib/tracker/bike";

export const dynamic = "force-dynamic";

// A UI preference, not an auth token - long-lived is fine, and it
// doesn't need to expire alongside the session (switching back in with a
// fresh magic link shouldn't reset which bike you were last looking at).
const ACTIVE_BIKE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

  const { bikeId } = body as { bikeId?: string };
  if (!bikeId) {
    return NextResponse.json({ error: "bikeId is required." }, { status: 400 });
  }

  // Confirm this bike actually belongs to the signed-in account before
  // trusting the cookie value - even though every downstream query is
  // already partition-scoped to this email regardless (so a forged
  // bikeId could never actually read another account's data), this
  // check is what turns "silently shows nothing" into a clear error.
  const bikes = await getBikesForUser(session.email);
  if (!bikes.some((b) => b.id === bikeId)) {
    return NextResponse.json({ error: "Bike not found on this account." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACTIVE_BIKE_COOKIE, bikeId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTIVE_BIKE_COOKIE_MAX_AGE,
  });
  return response;
}
