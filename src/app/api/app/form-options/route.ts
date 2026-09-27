// Place at: src/app/api/app/form-options/route.ts
//
// The Android app's logging-form choices (see lib/app/formOptions.ts).
// Public, identical for everyone and only changes with a deploy, so it's
// built once at build time and cached.
import { NextResponse } from "next/server";
import { getFormOptions } from "@/lib/app/formOptions";

export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(getFormOptions(), { headers: { "Cache-Control": "public, max-age=3600" } });
}
