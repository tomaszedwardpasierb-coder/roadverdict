// Place at: src/app/api/tracker/cost-calculator-lookup/route.ts
//
// Shared by both Cost Calculator forms (bike and car) - same
// vehicle-neutral reasoning as quote-lookup/route.ts. Calls
// MotHistoryDetails (identity + MOT advisories) and VehicleTaxDetails
// (real tax/SORN status, replacing a benchmark tax estimate) in
// parallel - no VehicleDetails call at all, same deliberate gaps as
// quote-lookup/route.ts (no vehicle-type classification, no
// authoritative EngineCapacityCc).
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseMotHistory, type RawMotTest } from "@/lib/tracker/motHistory";
import { fetchVehicleTaxDetailsFromVdg, type VehicleTaxDetails } from "@/lib/tracker/vehicleTaxFetch";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { canRunVehicleLookup, recordVehicleLookupRun } from "@/lib/tracker/vehicleLookupCooldown";

export const dynamic = "force-dynamic";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface VdgMotResponse {
  ResponseInformation: { StatusCode: number; IsSuccessStatusCode: boolean };
  Results: {
    MotHistoryDetails?: {
      Make?: string;
      Model?: string;
      FuelType?: string;
      Colour?: string;
      MotDueDate?: string | null;
      MotTestDetailsList?: RawMotTest[];
    };
  };
}

export interface CostCalculatorLookupResult {
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
  // null when VDG_API_KEY somehow isn't set (shouldn't happen, since
  // the MOT half already requires it) or the tax lookup itself failed -
  // degrades the same way MOT history already does elsewhere: the
  // lookup still succeeds, this section just stays empty.
  taxDetails: VehicleTaxDetails | null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const lookupUser = await getUserDoc(session.email);
  if (!canRunVehicleLookup(lookupUser)) {
    return NextResponse.json({ error: "Please wait a few seconds before looking up another registration." }, { status: 429 });
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

  let motData: VdgMotResponse;
  let taxDetails: VehicleTaxDetails | null;
  try {
    const [motRes, tax] = await Promise.all([
      fetch(`${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`),
      fetchVehicleTaxDetailsFromVdg(vrm, apiKey),
    ]);
    motData = await motRes.json();
    taxDetails = tax;
  } catch (err) {
    console.error("Cost calculator lookup request failed:", err);
    return NextResponse.json({ error: "Couldn't reach the lookup service. Enter the details manually." }, { status: 502 });
  }
  await recordVehicleLookupRun(session.email);

  if (!motData.ResponseInformation?.IsSuccessStatusCode || !motData.Results?.MotHistoryDetails) {
    return NextResponse.json({ error: "No vehicle found for that registration. Enter the details manually." }, { status: 404 });
  }

  const details = motData.Results.MotHistoryDetails;
  const plateInRetention = motData.ResponseInformation.StatusCode === 21;
  const parsed = parseMotHistory(details.MotDueDate ?? null, details.MotTestDetailsList ?? []);

  const result: CostCalculatorLookupResult = {
    vrm,
    make: details.Make ?? "",
    model: details.Model ?? "",
    fuelType: details.FuelType ?? "",
    colour: details.Colour ?? "",
    plateInRetention,
    motDueDate: parsed.motDueDate,
    motTests: [...parsed.tests].reverse(),
    taxDetails,
  };

  return NextResponse.json(result);
}
