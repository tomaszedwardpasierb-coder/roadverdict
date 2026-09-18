// Place at: src/app/api/tracker/mot-history-preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseMotHistory, type RawMotTest, type ParsedMotTest } from "@/lib/tracker/motHistory";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { canRunVehicleLookup, recordVehicleLookupRun } from "@/lib/tracker/vehicleLookupCooldown";
import { getCachedMotHistoryLookup, setCachedMotHistoryLookup } from "@/lib/tracker/motHistoryLookupCache";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

export const dynamic = "force-dynamic";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

// Read-only, no bikeId needed - unlike /api/tracker/mot-history (which
// writes bill records against an existing bike), this just answers "what's
// the most recent DVSA-confirmed odometer reading for this VRM", for use
// while a bike is still being added and doesn't exist yet.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const vrm = request.nextUrl.searchParams.get("vrm")?.trim().toUpperCase().replace(/\s+/g, "");
  if (!vrm) {
    return NextResponse.json({ error: "Registration number is required." }, { status: 400 });
  }

  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error("VDG_API_KEY is not configured.");
    return NextResponse.json({ error: "MOT lookup is not available right now." }, { status: 503 });
  }

  // Checked before the cooldown gate below, same ordering as
  // buying-guide-lookup/route.ts and plate-lookup/route.ts - shared with
  // quote-lookup, which queries this exact same VDG package for the
  // same plate.
  const cached = await getCachedMotHistoryLookup(vrm);
  let motTestsOldestFirst: ParsedMotTest[];

  if (cached) {
    motTestsOldestFirst = cached.motTestsOldestFirst;
  } else {
    const lookupUser = await getUserDoc(session.email);
    if (!canRunVehicleLookup(lookupUser)) {
      return NextResponse.json({ error: "Please wait a few seconds before looking up another registration." }, { status: 429 });
    }

    const url = `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`;

    let data: any;
    try {
      const res = await fetchWithTimeout(url);
      data = await res.json();
    } catch (err) {
      console.error("VDG MOT history preview request failed:", err);
      return NextResponse.json({ error: "Couldn't reach the MOT lookup service." }, { status: 502 });
    }
    await recordVehicleLookupRun(session.email);

    if (!data?.ResponseInformation?.IsSuccessStatusCode || !data?.Results?.MotHistoryDetails) {
      // Genuinely normal, not an error - MOT-exempt (under 3 years old) or
      // simply no test history yet. Not cached, same as quote-lookup's
      // identical not-found branch - nothing real to cache here.
      return NextResponse.json({ latestTrustedMileage: null, latestTestDate: null });
    }

    const motData = data.Results.MotHistoryDetails;
    const parsed = parseMotHistory(motData.MotDueDate ?? null, (motData.MotTestDetailsList ?? []) as RawMotTest[]);
    motTestsOldestFirst = parsed.tests;

    await setCachedMotHistoryLookup(vrm, {
      make: motData.Make ?? "",
      model: motData.Model ?? "",
      fuelType: motData.FuelType ?? "",
      colour: motData.Colour ?? "",
      plateInRetention: data.ResponseInformation.StatusCode === 21,
      motDueDate: parsed.motDueDate,
      motTestsOldestFirst: parsed.tests,
    });
  }

  // motTestsOldestFirst is already sorted oldest-to-newest by parseMotHistory.
  const trustedTests = motTestsOldestFirst.filter((t) => t.mileage != null);
  const latest = trustedTests.length > 0 ? trustedTests[trustedTests.length - 1] : null;

  return NextResponse.json({
    latestTrustedMileage: latest?.mileage ?? null,
    latestTestDate: latest?.testDate ?? null,
  });
}
