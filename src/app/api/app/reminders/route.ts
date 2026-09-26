// Place at: src/app/api/app/reminders/route.ts
//
// The Android app's Reminders tab for one vehicle. Read-only: adding,
// marking done and deleting go through the web's own reminder routes
// (tracker/reminders, cars/car-reminders), with the app naming its
// vehicle in a header. The vehicle is looked up inside the signed-in
// account's own partition.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getReminderList } from "@/lib/app/homeData";

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

  const data = await getReminderList(session.email, kind, id);
  if (!data) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(data, { headers: NO_STORE });
}
