// Place at: src/app/api/tracker/pending-scan-batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getPrimaryCar } from "@/lib/tracker/car";
import { getPendingScanBatch, savePendingScanBatch, deletePendingScanBatch } from "@/lib/tracker/pendingScanBatch";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

// Resolves which vehicle's pending batch this request is about. Not
// sent by an old client build -> defaults to "motorcycle", same
// fallback the receipt-scan routes already use.
async function resolveVehicleId(email: string, vehicleKind: string | null): Promise<{ id: string } | null> {
  if (vehicleKind === "car") {
    const car = await getPrimaryCar(email);
    return car ? { id: car.id } : null;
  }
  const bike = await getPrimaryBike(email);
  return bike ? { id: bike.id } : null;
}

function notFoundMessage(vehicleKind: string | null): string {
  return vehicleKind === "car" ? "No car found for this account." : "No bike found for this account.";
}

// Checked on dashboard load to offer resuming an interrupted batch.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const vehicleKind = request.nextUrl.searchParams.get("vehicleKind");
  const vehicle = await resolveVehicleId(session.email, vehicleKind);
  if (!vehicle) {
    return NextResponse.json({ error: notFoundMessage(vehicleKind) }, { status: 404 });
  }
  const batch = await getPendingScanBatch(session.email, vehicle.id);
  return NextResponse.json({ batch });
}

// Both the initial save right after a scan finishes parsing, and every
// subsequent rewrite as the queue commits items one at a time - the
// client always sends the full, current list of what's still left, not
// a delta, so this is always a plain, safe upsert.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { items, vehicleKind } = body as { items?: ParsedReceiptItem[]; vehicleKind?: string };
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Missing items." }, { status: 400 });
  }

  const vehicle = await resolveVehicleId(session.email, vehicleKind ?? null);
  if (!vehicle) {
    return NextResponse.json({ error: notFoundMessage(vehicleKind ?? null) }, { status: 404 });
  }

  // An empty list means the batch is done - delete rather than store a
  // pointless empty document that would otherwise sit there until
  // something else cleans it up.
  if (items.length === 0) {
    await deletePendingScanBatch(session.email, vehicle.id);
    return NextResponse.json({ ok: true });
  }

  const batch = await savePendingScanBatch(session.email, vehicle.id, items);
  return NextResponse.json({ batch });
}

// Explicit discard - the owner said "never mind" rather than the queue
// finishing normally.
export async function DELETE(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const vehicleKind = request.nextUrl.searchParams.get("vehicleKind");
  const vehicle = await resolveVehicleId(session.email, vehicleKind);
  if (!vehicle) {
    return NextResponse.json({ error: notFoundMessage(vehicleKind) }, { status: 404 });
  }
  await deletePendingScanBatch(session.email, vehicle.id);
  return NextResponse.json({ ok: true });
}
