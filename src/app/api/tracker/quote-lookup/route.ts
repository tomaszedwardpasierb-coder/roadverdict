// Place at: src/app/api/tracker/quote-lookup/route.ts
//
// Shared by both Quote Checker forms (bike and car) - genuinely
// vehicle-neutral, same as /api/tracker/plate-lookup. Deliberately
// fetches the MOT history ONLY (DVSA, or VDG's MotHistoryDetails as the
// fallback - see motHistorySource.ts), not VDG's VehicleDetails:
// MotHistoryDetails already carries Make/Model/FuelType/Colour at its
// top level (confirmed from a real sample), so a second call isn't
// needed just for identity, and Quote Checker's actual job - judging
// whether a quoted repair price is fair - benefits far more from real
// MOT advisories than from a DvlaBodyType field or exact engine cc.
//
// Two known, deliberate gaps versus the old VehicleDetails-based
// lookup, both confirmed acceptable:
// - No vehicle-type classification here at all (MotHistoryDetails has
//   no body-type field) - a car's plate searched on the bike tool (or
//   vice versa) is no longer explicitly rejected; the caller's own
//   brand/model matching against its own vehicle-kind's list is the
//   only signal left.
// - No EngineCapacityCc, so no authoritative engine-size auto-fill -
//   callers fall back to matching the returned Model against their own
//   curated model list (bikes only; CAR_MODELS deliberately carries no
//   engine data at all, see carModels.ts's own header comment).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseMotHistory } from "@/lib/tracker/motHistory";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { canRunVehicleLookup, recordVehicleLookupRun } from "@/lib/tracker/vehicleLookupCooldown";
import { getCachedMotHistoryLookup, setCachedMotHistoryLookup } from "@/lib/tracker/motHistoryLookupCache";
import { fetchMotHistoryDetails } from "@/lib/mot/motHistorySource";

export const dynamic = "force-dynamic";

export interface QuoteLookupResult {
  vrm: string;
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
  motDueDate: string | null;
  motTests: {
    testDate: string;
    passed: boolean;
    mileage: number | null;
    mileageTrusted: boolean;
    notes: string;
  }[];
}

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
    return NextResponse.json({ error: "Lookup is not available right now." }, { status: 503 });
  }

  // Checked before the cooldown gate below, same ordering as
  // buying-guide-lookup/route.ts and plate-lookup/route.ts - shared with
  // mot-history-preview, which queries this exact same VDG package for
  // the same plate.
  const cached = await getCachedMotHistoryLookup(vrm);
  if (cached) {
    const result: QuoteLookupResult = {
      vrm,
      make: cached.make,
      model: cached.model,
      fuelType: cached.fuelType,
      colour: cached.colour,
      plateInRetention: cached.plateInRetention,
      motDueDate: cached.motDueDate,
      motTests: [...cached.motTestsOldestFirst].reverse(),
    };
    return NextResponse.json(result);
  }

  const lookupUser = await getUserDoc(session.email);
  if (!canRunVehicleLookup(lookupUser)) {
    return NextResponse.json({ error: "Please wait a few seconds before looking up another registration." }, { status: 429 });
  }

  const lookup = await fetchMotHistoryDetails(vrm);
  if (lookup.status === "unavailable") {
    return NextResponse.json({ error: "Couldn't reach the lookup service. Enter the details manually." }, { status: 502 });
  }
  await recordVehicleLookupRun(session.email);

  if (lookup.status === "not_found") {
    return NextResponse.json({ error: "No vehicle found for that registration. Enter the details manually." }, { status: 404 });
  }

  const details = lookup.details;
  const plateInRetention = lookup.plateInRetention;
  const parsed = parseMotHistory(details.MotDueDate ?? null, details.MotTestDetailsList ?? []);

  await setCachedMotHistoryLookup(vrm, {
    make: details.Make ?? "",
    model: details.Model ?? "",
    fuelType: details.FuelType ?? "",
    colour: details.Colour ?? "",
    plateInRetention,
    motDueDate: parsed.motDueDate,
    motTestsOldestFirst: parsed.tests,
  });

  const result: QuoteLookupResult = {
    vrm,
    make: details.Make ?? "",
    model: details.Model ?? "",
    fuelType: details.FuelType ?? "",
    colour: details.Colour ?? "",
    plateInRetention,
    motDueDate: parsed.motDueDate,
    // Newest first for display, same convention as the buying-guide
    // lookup routes - parseMotHistory returns oldest-first internally.
    motTests: [...parsed.tests].reverse(),
  };

  return NextResponse.json(result);
}
