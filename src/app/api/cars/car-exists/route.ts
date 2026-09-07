// Place at: src/app/api/cars/car-exists/route.ts
//
// Signed-in only, since the only consumer is the add-car flow, which
// always requires an account already. Deliberately never reveals a
// previous or current owner's identity, email, or account details -
// the response is just "does this exist" and "is it yours," nothing
// that could be used to identify a stranger.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findCarByRegistrationAcrossAccounts } from "@/lib/tracker/car";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const registration = request.nextUrl.searchParams.get("registration");
  if (!registration) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  const match = await findCarByRegistrationAcrossAccounts(registration);
  if (!match) {
    return NextResponse.json({ exists: false });
  }

  const belongsToCurrentUser = match.ownerEmail === session.email;
  return NextResponse.json({
    exists: true,
    belongsToCurrentUser,
    carId: belongsToCurrentUser ? match.carId : undefined,
  });
}
