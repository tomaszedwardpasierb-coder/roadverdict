// Place at: src/app/api/tracker/mot-history/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBike, getCurrentRegistration } from "@/lib/tracker/bike";
import { importMotHistoryForBike } from "@/lib/tracker/motHistoryImport";

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
  const { bikeId } = body as { bikeId?: string };
  if (!bikeId) {
    return NextResponse.json({ error: "bikeId is required." }, { status: 400 });
  }

  const bike = await getBike(session.email, bikeId);
  if (!bike) {
    return NextResponse.json({ error: "Bike not found." }, { status: 404 });
  }

  const registration = getCurrentRegistration(bike);
  if (!registration) {
    return NextResponse.json(
      { error: "This bike has no registration on record, so it can't be looked up." },
      { status: 400 }
    );
  }

  const result = await importMotHistoryForBike(session.email, bike, registration);
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
