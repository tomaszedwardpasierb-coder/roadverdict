// Place at: src/app/api/app/vehicle-options/route.ts
//
// The Android app's "Add a vehicle" choices (see lib/app/vehicleOptions.ts).
// Public, identical for everyone and only changes with a deploy, so it's
// built once at build time and cached.
import { NextResponse } from "next/server";
import { getVehicleOptions } from "@/lib/app/vehicleOptions";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getVehicleOptions(), { headers: { "Cache-Control": "public, max-age=3600" } });
}
