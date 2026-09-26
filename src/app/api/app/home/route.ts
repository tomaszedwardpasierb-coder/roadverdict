// Place at: src/app/api/app/home/route.ts
//
// The Android app's Home screen for one vehicle: what's due, what's been
// spent this month and year, and the latest logbook entries. The vehicle
// is looked up inside the signed-in account's own partition, so an id
// belonging to anyone else simply isn't found.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getHomeData } from "@/lib/app/homeData";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if ((kind !== "bike" && kind !== "car") || !id) {
    return NextResponse.json({ error: "kind (bike or car) and id are required" }, { status: 400, headers: NO_STORE });
  }

  const data = await getHomeData(session.email, kind, id);
  if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
