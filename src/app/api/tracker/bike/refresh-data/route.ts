// Place at: src/app/api/tracker/bike/refresh-data/route.ts
//
// Self-serve version of what today has otherwise needed a console fetch
// or admin impersonation to do: re-run the DVLA vehicle-data fetch and
// MOT import for a bike that already exists. Needed because both of
// those only ever ran automatically once, at bike-creation time - any
// bike added before either feature existed (or before its own plate was
// correctly on record) never gets a second chance without this.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBike, getCurrentRegistration, updateBikeDvlaData } from "@/lib/tracker/bike";
import { fetchDvlaDataFromVdg } from "@/lib/tracker/dvlaDataFetch";
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

  // Scoped to the signed-in account's own bike - unlike the admin
  // override built earlier today, this never accepts an email or VRM
  // from the request; it only ever acts on what's already on record for
  // whoever is actually signed in.
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

  let dvlaRefreshed = false;
  try {
    const dvlaData = await fetchDvlaDataFromVdg(registration);
    if (dvlaData) {
      await updateBikeDvlaData(session.email, bike.id, dvlaData);
      dvlaRefreshed = true;
    }
  } catch (err) {
    console.error("DVLA data refresh failed:", err);
  }

  let motCreated = 0;
  let motSkipped = 0;
  try {
    const result = await importMotHistoryForBike(session.email, bike, registration);
    if (!("error" in result)) {
      motCreated = result.createdCount;
      motSkipped = result.skippedCount;
    }
  } catch (err) {
    console.error("MOT refresh failed:", err);
  }

  return NextResponse.json({ ok: true, dvlaRefreshed, motCreated, motSkipped });
}
