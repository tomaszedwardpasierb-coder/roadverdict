// Place at: src/app/api/tracker/pending-scan-batch/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getPendingScanBatch, savePendingScanBatch, deletePendingScanBatch } from "@/lib/tracker/pendingScanBatch";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

// Checked on dashboard load to offer resuming an interrupted batch.
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  const batch = await getPendingScanBatch(session.email, bike.id);
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
  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { items } = body as { items?: ParsedReceiptItem[] };
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: "Missing items." }, { status: 400 });
  }

  // An empty list means the batch is done - delete rather than store a
  // pointless empty document that would otherwise sit there until
  // something else cleans it up.
  if (items.length === 0) {
    await deletePendingScanBatch(session.email, bike.id);
    return NextResponse.json({ ok: true });
  }

  const batch = await savePendingScanBatch(session.email, bike.id, items);
  return NextResponse.json({ batch });
}

// Explicit discard - the owner said "never mind" rather than the queue
// finishing normally.
export async function DELETE() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  await deletePendingScanBatch(session.email, bike.id);
  return NextResponse.json({ ok: true });
}
