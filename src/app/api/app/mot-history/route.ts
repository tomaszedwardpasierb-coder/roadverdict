// Place at: src/app/api/app/mot-history/route.ts
//
// The app's MOT history screen for one of the signed-in account's own
// vehicles: every MOT test, each advisory and failure explained, and the
// RoadVerdict MOT score - the same as the website's free MOT check
// (lib/mot/motHistoryView.ts), for a vehicle the owner already has.
//
// Uses the MOT check's 24-hour cache, so opening the screen again is free;
// a new lookup only happens once a day per plate at most. The demo account
// never looks a plate up: it gets made-up records (lib/mot/demoMotRecords.ts),
// because a demo plate may belong to a real vehicle.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBike, getCurrentRegistration as bikeRegistration } from "@/lib/tracker/bike";
import { getCarById, getCurrentRegistration as carRegistration } from "@/lib/tracker/car";
import { DEMO_EMAIL } from "@/lib/tracker/demoSeed";
import { cleanRegistration, type MotRecord } from "@/lib/mot/motRecord";
import { cachedMotLookup, freshMotLookup } from "@/lib/mot/motCheckLookup";
import { demoBikeMotRecord, demoCarMotRecord } from "@/lib/mot/demoMotRecords";
import { toMotHistoryView } from "@/lib/mot/motHistoryView";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };
const APP_URL = process.env.APP_URL ?? "https://roadverdict.co.uk";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const kind = req.nextUrl.searchParams.get("kind");
  const id = req.nextUrl.searchParams.get("id");
  if ((kind !== "bike" && kind !== "car") || !id) {
    return NextResponse.json({ error: "kind (bike or car) and id are required" }, { status: 400, headers: NO_STORE });
  }

  const vehicle = kind === "bike" ? await getBike(session.email, id) : await getCarById(session.email, id);
  if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404, headers: NO_STORE });

  if (session.email === DEMO_EMAIL) {
    const record = kind === "bike" ? demoBikeMotRecord() : demoCarMotRecord();
    return NextResponse.json({ status: "found", view: toMotHistoryView(record, APP_URL) }, { headers: NO_STORE });
  }

  const raw = kind === "bike" ? bikeRegistration(vehicle as Parameters<typeof bikeRegistration>[0]) : carRegistration(vehicle as Parameters<typeof carRegistration>[0]);
  const registration = cleanRegistration(raw);
  if (!registration) return NextResponse.json({ status: "no_registration" }, { headers: NO_STORE });

  const result = (await cachedMotLookup(registration)) ?? (await freshMotLookup(registration));
  if (result.status !== "found") return NextResponse.json({ status: result.status }, { headers: NO_STORE });

  // The owner told us what this is; the record's own kind is only a guess.
  const record: MotRecord = { ...result.record, kind };
  return NextResponse.json({ status: "found", view: toMotHistoryView(record, APP_URL) }, { headers: NO_STORE });
}
