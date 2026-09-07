// Place at: src/app/api/cars/active-car/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getCarsForUser, ACTIVE_CAR_COOKIE } from "@/lib/tracker/car";
import { ACTIVE_VEHICLE_KIND_COOKIE } from "@/lib/tracker/activeVehicle";

export const dynamic = "force-dynamic";

// Mirrors ACTIVE_BIKE_COOKIE_MAX_AGE - a UI preference, not an auth
// token, so it's fine for it to outlive the session.
const ACTIVE_CAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

  // Confirm this car actually belongs to the signed-in account before
  // trusting the cookie value - same reasoning as active-bike.
  const cars = await getCarsForUser(session.email);
  if (!cars.some((c) => c.id === carId)) {
    return NextResponse.json({ error: "Car not found on this account." }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ACTIVE_CAR_COOKIE, carId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTIVE_CAR_COOKIE_MAX_AGE,
  });
  // Records which VEHICLE KIND is active, not just which car - see
  // activeVehicle.ts for why a single-kind cookie can't supply this on
  // its own for an account holding both a bike and a car.
  response.cookies.set(ACTIVE_VEHICLE_KIND_COOKIE, "car", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: ACTIVE_CAR_COOKIE_MAX_AGE,
  });
  return response;
}
