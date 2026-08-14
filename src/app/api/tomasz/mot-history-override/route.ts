// Place at: src/app/api/tomasz/mot-history-override/route.ts
//
// Admin-only correction tool for a specific real scenario: a bike's
// current registration in RoadVerdict isn't the plate DVSA has MOT test
// history under (e.g. it was added under a later plate after a real
// registration change that happened before the bike was ever entered
// here). Takes an explicit VRM instead of deriving one from the bike -
// never exposed to regular users, since that would let anyone pull MOT
// data for a plate unrelated to their own bike. Deliberately does NOT
// touch the bike's own registration fields at all - only imports MOT
// bills and sets the reminder, same as the normal endpoint, just against
// a different search plate.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { getBike } from "@/lib/tracker/bike";
import { importMotHistoryForBike } from "@/lib/tracker/motHistoryImport";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) {
    return NextResponse.json({ error: "Not signed in as admin." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { email, bikeId, vrm } = body as { email?: string; bikeId?: string; vrm?: string };
  if (!email || !bikeId || !vrm) {
    return NextResponse.json({ error: "email, bikeId, and vrm are all required." }, { status: 400 });
  }

  const bike = await getBike(email, bikeId);
  if (!bike) {
    return NextResponse.json({ error: "Bike not found for that account." }, { status: 404 });
  }

  const result = await importMotHistoryForBike(email, bike, vrm.trim().toUpperCase());
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result);
}
