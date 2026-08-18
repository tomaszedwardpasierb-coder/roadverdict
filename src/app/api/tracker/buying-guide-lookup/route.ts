// Place at: src/app/api/tracker/buying-guide-lookup/route.ts
//
// Purpose-built for Buying a Used Bike: someone checking a specific
// bike before buying it wants purchase due-diligence info (does the
// mileage record look genuine, has it failed on anything dangerous),
// not the plain make/model/engine that Cost Calculator and Quote
// Checker need. Deliberately a new route rather than widening
// /api/tracker/mot-history-preview - that one already has a specific,
// narrow contract other code relies on (feeding an initial mileage
// guess while a bike is being added), and changing its response shape
// risks that existing caller for no reason when a new route risks
// nothing there at all.
//
// Costs two metered VDG calls per lookup, not one - vehicle details
// and MOT history are separate VDG packages, run in parallel here to
// keep latency down, but each still bills separately. Worth knowing
// if VDG usage/cost is ever being watched.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { parseMotHistory, type RawMotTest } from "@/lib/tracker/motHistory";

export const dynamic = "force-dynamic";

const VDG_ENDPOINT = "https://uk.api.vehicledataglobal.com/r2/lookup";

interface VdgVehicleResponse {
  ResponseInformation: { StatusCode: number; IsSuccessStatusCode: boolean };
  Results: {
    VehicleDetails?: {
      VehicleIdentification: {
        Vrm: string;
        DvlaMake: string;
        DvlaModel: string;
        YearOfManufacture: number;
        DvlaFuelType: string;
      };
      VehicleHistory?: { ColourDetails?: { CurrentColour: string } };
    };
    ModelDetails?: {
      ModelIdentification: { Make: string; Model: string };
      Powertrain?: { IceDetails?: { EngineCapacityCc: number } };
    };
  };
}

interface VdgMotResponse {
  ResponseInformation: { IsSuccessStatusCode: boolean };
  Results: {
    MotHistoryDetails?: {
      MotDueDate?: string | null;
      MotTestDetailsList?: RawMotTest[];
    };
  };
}

export interface BuyingGuideLookupResult {
  vrm: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  colour: string;
  engineCapacityCc: number | null;
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

  const vehicleUrl = `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=VehicleDetails&vrm=${encodeURIComponent(vrm)}`;
  const motUrl = `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=MotHistoryDetails&vrm=${encodeURIComponent(vrm)}`;

  let vehicleData: VdgVehicleResponse;
  let motData: VdgMotResponse | null;
  try {
    const [vehicleRes, motRes] = await Promise.all([fetch(vehicleUrl), fetch(motUrl)]);
    vehicleData = await vehicleRes.json();
    // MOT history failing to fetch isn't fatal to the whole lookup -
    // the vehicle-identity half is the one that actually needs to
    // succeed; MOT data is a bonus that degrades to "none found"
    // rather than failing the request outright.
    motData = await motRes.json().catch(() => null);
  } catch (err) {
    console.error("Buying guide lookup request failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach the lookup service. Enter the details manually." },
      { status: 502 }
    );
  }

  if (!vehicleData.ResponseInformation?.IsSuccessStatusCode || !vehicleData.Results?.VehicleDetails) {
    return NextResponse.json(
      { error: "No vehicle found for that registration. Enter the details manually." },
      { status: 404 }
    );
  }

  const vd = vehicleData.Results.VehicleDetails;
  const md = vehicleData.Results.ModelDetails;

  // StatusCode 21 = "PlateInRetentionLastVehicleReturned" - see
  // plate-lookup/route.ts for the same handling, confirmed real
  // during testing there, not a hypothetical edge case.
  const plateInRetention = vehicleData.ResponseInformation.StatusCode === 21;

  let motDueDate: string | null = null;
  let motTests: BuyingGuideLookupResult["motTests"] = [];
  const motDetails = motData?.ResponseInformation?.IsSuccessStatusCode ? motData.Results?.MotHistoryDetails : undefined;
  if (motDetails) {
    const parsed = parseMotHistory(motDetails.MotDueDate ?? null, motDetails.MotTestDetailsList ?? []);
    motDueDate = parsed.motDueDate;
    // Newest first for display - parseMotHistory returns oldest-first
    // internally (needed for its own retest-dedup logic), but a buyer
    // reading this wants the most recent test at the top.
    motTests = [...parsed.tests].reverse();
  }

  const result: BuyingGuideLookupResult = {
    vrm: vd.VehicleIdentification.Vrm,
    make: md?.ModelIdentification?.Make || vd.VehicleIdentification.DvlaMake,
    model: md?.ModelIdentification?.Model || vd.VehicleIdentification.DvlaModel,
    year: vd.VehicleIdentification.YearOfManufacture,
    fuelType: vd.VehicleIdentification.DvlaFuelType,
    colour: vd.VehicleHistory?.ColourDetails?.CurrentColour ?? "",
    engineCapacityCc: md?.Powertrain?.IceDetails?.EngineCapacityCc ?? null,
    plateInRetention,
    motDueDate,
    motTests,
  };

  return NextResponse.json(result);
}
