// Place at: src/app/api/tracker/commit-receipt-item/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { commitReceiptItem } from "@/lib/tracker/commitReceiptItem";
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

  let body: { item?: ParsedReceiptItem; batchHints?: { date: string; mileage: number }[]; boundsOnlyHints?: { date: string; mileage: number; batchIndex?: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.item) {
    return NextResponse.json({ error: "Nothing to commit." }, { status: 400 });
  }

  try {
    const entry = await commitReceiptItem(session.email, bike, body.item, body.batchHints ?? [], body.boundsOnlyHints ?? []);
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong saving this entry. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
