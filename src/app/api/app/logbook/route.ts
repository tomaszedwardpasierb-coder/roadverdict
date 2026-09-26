// Place at: src/app/api/app/logbook/route.ts
//
// The Android app's Logbook for one vehicle: every entry across all
// seven categories, newest first, plus a count per category for the
// filter chips. Filtering happens in the app - a logbook is small enough
// to send whole, and switching chips then needs no round trip. The
// vehicle is looked up inside the signed-in account's own partition, so
// an id belonging to anyone else simply isn't found.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getLogbook } from "@/lib/app/homeData";

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

  const data = await getLogbook(session.email, kind, id);
  if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
