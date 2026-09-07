// Place at: src/app/api/tracker/commit-receipt-item/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getPrimaryBike } from "@/lib/tracker/bike";
import { getPrimaryCar } from "@/lib/tracker/car";
import { commitReceiptItem } from "@/lib/tracker/commitReceiptItem";
import { commitCarReceiptItem } from "@/lib/tracker/commitCarReceiptItem";
import type { ParsedReceiptItem } from "@/lib/tracker/receiptParse";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { item?: ParsedReceiptItem; vehicleKind?: string; batchHints?: { date: string; mileage: number }[]; boundsOnlyHints?: { date: string; mileage: number; batchIndex?: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.item) {
    return NextResponse.json({ error: "Nothing to commit." }, { status: 400 });
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

  try {
    const entry = bike
      ? await commitReceiptItem(session.email, bike, body.item, body.batchHints ?? [], body.boundsOnlyHints ?? [])
      : await commitCarReceiptItem(session.email, car as NonNullable<typeof car>, body.item, body.batchHints ?? [], body.boundsOnlyHints ?? []);
    return NextResponse.json({ entry });
  } catch (err) {
    return NextResponse.json(
      { error: "Something went wrong saving this entry. Please try again.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
