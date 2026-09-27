// Place at: src/app/api/app/buying-options/route.ts
//
// The Android app's buying-guide checklist choices (see
// lib/app/buyingOptions.ts). Public, identical for everyone and only
// changes with a deploy, so it's built once at build time and cached.
import { NextResponse } from "next/server";
import { getBuyingOptions } from "@/lib/app/buyingOptions";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getBuyingOptions(), { headers: { "Cache-Control": "public, max-age=3600" } });
}
