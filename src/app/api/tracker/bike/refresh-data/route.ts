// Place at: src/app/api/tracker/bike/refresh-data/route.ts
//
// Self-serve version of what today has otherwise needed a console fetch
// or admin impersonation to do: re-run the DVLA vehicle-data fetch, MOT
// import, and tax/SORN check for a bike that already exists. Needed
// because all three only ever ran automatically once, at bike-creation
// time - any bike added before a feature existed (or before its own
// plate was correctly on record) never gets a second chance without this.
// The tax/SORN check also matters on an ongoing basis, not just once -
// see reminder.ts's syncSornReminder for how a SORN'd vehicle's
// permanent reminder gets created and, eventually, cleared.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBike, getCurrentRegistration, updateBikeDvlaData, isBikeReadOnly, BIKE_READ_ONLY_MESSAGE } from "@/lib/tracker/bike";
import { fetchDvlaDataFromVdg } from "@/lib/tracker/dvlaDataFetch";
import { importMotHistoryForBike } from "@/lib/tracker/motHistoryImport";
import { fetchVehicleTaxDetailsFromVdg } from "@/lib/tracker/vehicleTaxFetch";
import { syncSornReminder } from "@/lib/tracker/reminder";
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
  if (isBikeReadOnly(bike)) {
    return NextResponse.json({ error: BIKE_READ_ONLY_MESSAGE }, { status: 403 });
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

  // taxStatus/taxDueDate are returned even when the vehicle is simply
  // taxed and nothing is wrong - the button surfaces this either way
  // (see RefreshVehicleDataButton.tsx), rather than only ever saying
  // something for the SORN case and staying silent otherwise. Silence
  // here (both left null) is itself a signal worth being able to see:
  // it means the check didn't run at all (no VDG_API_KEY configured) or
  // the VDG call itself failed, not that everything's fine.
  let sorned = false;
  let taxStatus: string | null = null;
  let taxDueDate: string | null = null;
  try {
    const apiKey = process.env.VDG_API_KEY;
    if (apiKey) {
      const taxDetails = await fetchVehicleTaxDetailsFromVdg(registration, apiKey);
      await syncSornReminder(session.email, bike.id, taxDetails?.taxStatus ?? null);
      sorned = taxDetails?.taxStatus?.trim().toUpperCase() === "SORN";
      taxStatus = taxDetails?.taxStatus ?? null;
      taxDueDate = taxDetails?.taxDueDate ?? null;
    }
  } catch (err) {
    console.error("Tax/SORN check failed during refresh:", err);
  }

  if (dvlaRefreshed || motCreated > 0) {
    void logImpersonationActivityForCurrentRequest("bike", bike.id, "update");
  }
  return NextResponse.json({ ok: true, dvlaRefreshed, motCreated, motSkipped, sorned, taxStatus, taxDueDate });
}
