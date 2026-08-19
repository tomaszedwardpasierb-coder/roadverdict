// Place at: src/app/api/tracker/bike-exists/route.ts
//
// Signed-in only, since the only consumer is the add-bike flow, which
// always requires an account already. Deliberately never reveals a
// previous or current owner's identity, email, or account details -
// the response is just "does this exist" and "is it yours," nothing
// that could be used to identify a stranger.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { findBikeByRegistrationAcrossAccounts } from "@/lib/tracker/bike";

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

  const match = await findBikeByRegistrationAcrossAccounts(registration);
  if (!match) {
    return NextResponse.json({ exists: false });
  }

  const belongsToCurrentUser = match.ownerEmail === session.email;
  return NextResponse.json({
    exists: true,
    belongsToCurrentUser,
    // Only ever handed back when it's genuinely the signed-in user's
    // own bike - a stranger's bikeId isn't itself sensitive, but
    // there's no reason to expose it either, and withholding it by
    // default costs nothing.
    bikeId: belongsToCurrentUser ? match.bikeId : undefined,
  });
}
