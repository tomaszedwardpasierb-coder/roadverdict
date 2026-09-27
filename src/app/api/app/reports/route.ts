// Place at: src/app/api/app/reports/route.ts
//
// The Android app's Reports and The Story So Far for one of the signed-in
// owner's vehicles, over one of the web charts' own date ranges (see
// lib/app/reportsData.ts). Pro figures are only included for a Pro
// account. The vehicle is looked up inside the signed-in account's own
// partition, so an id belonging to anyone else simply isn't found.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getReports } from "@/lib/app/reportsData";
import { RANGE_OPTIONS, type RangeValue } from "@/lib/tracker/dateRange";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

function isRange(value: string | null): value is RangeValue {
  return value !== null && RANGE_OPTIONS.some((r) => r.value === value);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const params = req.nextUrl.searchParams;
  const kind = params.get("kind");
  const id = params.get("id");
  const range = params.get("range") ?? "all";
  if ((kind !== "bike" && kind !== "car") || !id || !isRange(range)) {
    return NextResponse.json({ error: "kind (bike or car), id and a valid range are required" }, { status: 400, headers: NO_STORE });
  }

  const data = await getReports(session.email, kind, id, range);
  if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
