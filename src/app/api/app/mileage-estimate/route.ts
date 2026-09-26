// Place at: src/app/api/app/mileage-estimate/route.ts
//
// Suggested mileage for a date, for the Android app's logging forms -
// what the web forms work out in the browser (useEstimatedMileage). The
// vehicle is looked up inside the signed-in account's own partition.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getMileageEstimate } from "@/lib/app/homeData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  const date = req.nextUrl.searchParams.get("date");
  if ((kind !== "bike" && kind !== "car") || !id || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "kind (bike or car), id and date (YYYY-MM-DD) are required" }, { status: 400, headers: NO_STORE });
  }

  const estimate = await getMileageEstimate(session.email, kind, id, date);
  if (!estimate) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(estimate, { headers: NO_STORE });
}
