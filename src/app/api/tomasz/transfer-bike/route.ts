// Place at: src/app/api/tomasz/transfer-bike/route.ts
//
// Admin-only, Phase 1 of the digital passport plan. There is no
// user-facing flow yet - this exists purely to exercise transferBike()
// against real accounts. includeRecords defaults to true here to match
// the feature's own default; pass false in the request body to test
// the bike-facts-only path instead.
import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin/session";
import { transferBike } from "@/lib/tracker/bikeTransfer";

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
  const { fromEmail, bikeId, toEmail, includeRecords } = body as {
    fromEmail?: string;
    bikeId?: string;
    toEmail?: string;
    includeRecords?: boolean;
  };
  if (!fromEmail || !bikeId || !toEmail) {
    return NextResponse.json({ error: "fromEmail, bikeId, and toEmail are all required." }, { status: 400 });
  }

  const result = await transferBike(
    fromEmail.trim().toLowerCase(),
    bikeId,
    toEmail.trim().toLowerCase(),
    includeRecords ?? true
  );

  if (!result.ok) {
    switch (result.reason) {
      case "bike_not_found":
        return NextResponse.json({ error: "No bike found for that account and ID." }, { status: 404 });
      case "already_transferred":
        return NextResponse.json({ error: "This bike has already been transferred - it's now read-only." }, { status: 409 });
      case "same_owner":
        return NextResponse.json({ error: "fromEmail and toEmail are the same account." }, { status: 409 });
      case "recipient_limit_reached":
        return NextResponse.json({ error: `Recipient already has the maximum of ${result.limit} bikes.` }, { status: 409 });
    }
  }

  return NextResponse.json({ newBike: result.newBike });
}
