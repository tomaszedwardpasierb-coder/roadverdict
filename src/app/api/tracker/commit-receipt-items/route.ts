// Place at: src/app/api/tracker/commit-receipt-items/route.ts
//
// Batch fallback only now - the review queue commits items one at a
// time as it reaches each one (see commit-receipt-item, singular), so
// every correction can feed the next estimate. This plural endpoint
// exists purely for "Finish later": whatever hasn't been reached yet
// when the queue is closed early still gets created here - in order,
// each one still seeing everything committed before it - rather than
// silently lost because the original photos aren't kept around to
// re-scan.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { commitReceiptItem, type ReviewQueueEntry } from "@/lib/tracker/commitReceiptItem";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const bike = await getPrimaryBike(session.email);
  if (!bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }

  let body: { items?: ParsedReceiptItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ createdEntries: [], createdCount: 0, categories: [] });
  }

  // Trust nothing about ordering from the client - re-sort here too.
  const items = [...body.items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  try {
    const createdEntries: ReviewQueueEntry[] = [];
    for (const item of items) {
      createdEntries.push(await commitReceiptItem(session.email, bike, item));
    }
    return NextResponse.json({
      createdEntries,
      createdCount: createdEntries.length,
      categories: [...new Set(createdEntries.map((e) => e.category))],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong saving these entries. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
