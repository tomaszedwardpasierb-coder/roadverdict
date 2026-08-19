import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const VDG_ENDPOINT = 'https://uk.api.vehicledataglobal.com/r2/lookup';

interface VdgResponse {
  ResponseInformation: {
    StatusCode: number;
    StatusMessage: string;
    IsSuccessStatusCode: boolean;
  };
  Results: {
    VehicleDetails?: {
      VehicleIdentification: {
        Vrm: string;
        DvlaMake: string;
        DvlaModel: string;
        YearOfManufacture: number;
        DvlaFuelType: string;
        DvlaBodyType: string;
      };
      VehicleHistory?: {
        ColourDetails?: { CurrentColour: string };
      };
    };
    ModelDetails?: {
      ModelIdentification: {
        Make: string;
        Model: string;
        Range: string;
      };
      Powertrain?: {
        IceDetails?: { EngineCapacityCc: number };
      };
    };
  };
}

export type VehicleTypeCheck = 'motorcycle' | 'four-wheeled' | 'unknown';

// Best-informed classification based on general DVLA body-type
// terminology, NOT verified against a live VDG response - this needs
// testing against a real motorcycle registration and a real car
// registration to confirm the actual returned DvlaBodyType strings
// match these assumptions before this is trusted in production. Errs
// toward "unknown" rather than guessing wrong in either direction:
// keyword lists here are deliberately not exhaustive, so anything that
// doesn't clearly match either side falls through to unknown rather
// than being force-classified.
const MOTORCYCLE_BODY_TYPE_KEYWORDS = ['MOTOR CYCLE', 'MOTORCYCLE', 'M/CYCLE', 'MOPED', 'SCOOTER'];
const FOUR_WHEELED_BODY_TYPE_KEYWORDS = [
  'SALOON', 'HATCHBACK', 'ESTATE', 'COUPE', 'CONVERTIBLE', 'MPV', 'SUV',
  '4X4', 'VAN', 'TRUCK', 'MINIBUS', 'PICK-UP', 'PICKUP', 'LIMOUSINE',
];

function classifyVehicleType(rawBodyType: string): VehicleTypeCheck {
  const normalized = rawBodyType.trim().toUpperCase();
  if (!normalized) return 'unknown';
  if (MOTORCYCLE_BODY_TYPE_KEYWORDS.some((kw) => normalized.includes(kw))) return 'motorcycle';
  if (FOUR_WHEELED_BODY_TYPE_KEYWORDS.some((kw) => normalized.includes(kw))) return 'four-wheeled';
  return 'unknown';
}

export interface PlateLookupResult {
  vrm: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  colour: string;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  vehicleType: VehicleTypeCheck;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const vrm = request.nextUrl.searchParams.get('vrm')?.trim().toUpperCase().replace(/\s+/g, '');
  if (!vrm) {
    return NextResponse.json({ error: 'Registration number is required.' }, { status: 400 });
  }

  const apiKey = process.env.VDG_API_KEY;
  if (!apiKey) {
    console.error('VDG_API_KEY is not configured.');
    return NextResponse.json({ error: 'Plate lookup is not available right now.' }, { status: 503 });
  }

  const url = `${VDG_ENDPOINT}?apiKey=${apiKey}&packageName=VehicleDetails&vrm=${encodeURIComponent(vrm)}`;

  let data: VdgResponse;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (err) {
    console.error('VDG lookup request failed:', err);
    return NextResponse.json(
      { error: "Couldn't reach the lookup service. Enter the details manually." },
      { status: 502 }
    );
  }

  if (!data.ResponseInformation?.IsSuccessStatusCode || !data.Results?.VehicleDetails) {
    return NextResponse.json(
      { error: 'No vehicle found for that registration. Enter the details manually.' },
      { status: 404 }
    );
  }

  const vd = data.Results.VehicleDetails;
  const md = data.Results.ModelDetails;

  // StatusCode 21 = "PlateInRetentionLastVehicleReturned" - the plate isn't
  // currently attached to any vehicle, and this is the last vehicle it was
  // ever on. Confirmed real during testing, not a hypothetical edge case -
  // the UI needs to surface this rather than present it as a clean match.
  const plateInRetention = data.ResponseInformation.StatusCode === 21;

  const result: PlateLookupResult = {
    vrm: vd.VehicleIdentification.Vrm,
    make: md?.ModelIdentification?.Make || vd.VehicleIdentification.DvlaMake,
    model: md?.ModelIdentification?.Model || vd.VehicleIdentification.DvlaModel,
    year: vd.VehicleIdentification.YearOfManufacture,
    fuelType: vd.VehicleIdentification.DvlaFuelType,
    colour: vd.VehicleHistory?.ColourDetails?.CurrentColour ?? '',
    engineCapacityCc: md?.Powertrain?.IceDetails?.EngineCapacityCc ?? null,
    plateInRetention,
    vehicleType: classifyVehicleType(vd.VehicleIdentification.DvlaBodyType ?? ''),
  };

  return NextResponse.json(result);
}
