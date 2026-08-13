// Place at: src/app/api/tracker/mot-history-preview/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseMotHistory, type RawMotTest } from "@/lib/tracker/motHistory";

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

  const url = `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`;

  let data: any;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (err) {
    console.error("VDG MOT history preview request failed:", err);
    return NextResponse.json({ error: "Couldn't reach the MOT lookup service." }, { status: 502 });
  }

  if (!data?.ResponseInformation?.IsSuccessStatusCode || !data?.Results?.MotHistoryDetails) {
    // Genuinely normal, not an error - MOT-exempt (under 3 years old) or
    // simply no test history yet.
    return NextResponse.json({ latestTrustedMileage: null, latestTestDate: null });
  }

  const motData = data.Results.MotHistoryDetails;
  const parsed = parseMotHistory(motData.MotDueDate ?? null, (motData.MotTestDetailsList ?? []) as RawMotTest[]);

  // parsed.tests is already sorted oldest-to-newest by parseMotHistory.
  const trustedTests = parsed.tests.filter((t) => t.mileage != null);
  const latest = trustedTests.length > 0 ? trustedTests[trustedTests.length - 1] : null;

  return NextResponse.json({
    latestTrustedMileage: latest?.mileage ?? null,
    latestTestDate: latest?.testDate ?? null,
  });
}
