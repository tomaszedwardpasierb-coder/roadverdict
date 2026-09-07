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
//
// Continues past a single item's failure rather than abandoning the
// rest of the batch - a bad OCR read on one receipt shouldn't cost the
// other nine, genuinely fine ones, their chance to be saved. Reports
// exactly which items succeeded and which didn't, rather than a single
// pass/fail for the whole call - the caller needs this to retry only
// what's actually still outstanding, never resending items that
// already saved successfully a moment earlier.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getPrimaryCar } from "@/lib/tracker/car";
import { commitReceiptItem, type ReviewQueueEntry } from "@/lib/tracker/commitReceiptItem";
import { commitCarReceiptItem } from "@/lib/tracker/commitCarReceiptItem";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { items?: ParsedReceiptItem[]; vehicleKind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Not sent by the current (motorcycle-only) client yet - defaults to
  // "motorcycle" so existing callers keep working unchanged.
  const vehicleKind = body.vehicleKind === "car" ? "car" : "motorcycle";
  const bike = vehicleKind === "motorcycle" ? await getPrimaryBike(session.email) : null;
  const car = vehicleKind === "car" ? await getPrimaryCar(session.email) : null;
  if (vehicleKind === "motorcycle" && !bike) {
    return NextResponse.json({ error: "No bike found for this account." }, { status: 404 });
  }
  if (vehicleKind === "car" && !car) {
    return NextResponse.json({ error: "No car found for this account." }, { status: 404 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ createdEntries: [], createdCount: 0, categories: [], failedItems: [], failedCount: 0 });
  }

  // Trust nothing about ordering from the client - re-sort here too.
  const items = [...body.items].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const commitItem = bike
    ? (item: ParsedReceiptItem) => commitReceiptItem(session.email, bike, item)
    : (item: ParsedReceiptItem) => commitCarReceiptItem(session.email, car as NonNullable<typeof car>, item);

  const createdEntries: ReviewQueueEntry[] = [];
  const failedItems: ParsedReceiptItem[] = [];
  let lastErrorDetail: string | undefined;

  for (const item of items) {
    try {
      createdEntries.push(await commitItem(item));
    } catch (err) {
      // Kept in the batch rather than dropped - each failed item is
      // still real, unsaved data the caller needs back so it can be
      // retried or shown to the person, not silently discarded here.
      failedItems.push(item);
      lastErrorDetail = err instanceof Error ? err.message : String(err);
      console.error("commit-receipt-items: one item failed, continuing with the rest of the batch:", lastErrorDetail);
    }
  }

  return NextResponse.json({
    createdEntries,
    createdCount: createdEntries.length,
    categories: [...new Set(createdEntries.map((e) => e.category))],
    failedItems,
    failedCount: failedItems.length,
    ...(failedItems.length > 0
      ? {
          error: `${createdEntries.length} of ${items.length} saved successfully; ${failedItems.length} couldn't be saved.`,
          detail: lastErrorDetail,
        }
      : {}),
  });
}
