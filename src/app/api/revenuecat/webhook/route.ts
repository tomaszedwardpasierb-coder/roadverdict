// Place at: src/app/api/revenuecat/webhook/route.ts
//
// RevenueCat tells us something changed for a customer - a purchase, a
// renewal, a cancellation, a refund, a transfer. We don't interpret the
// event: we re-read that customer's current "pro" entitlement from
// RevenueCat and copy it onto their account (syncStorePro), for every
// account the event names. Authenticated by the shared secret set as the
// webhook's Authorization header in RevenueCat.
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { storePurchasesEnabled, syncStorePro } from "@/lib/payments/storePro";

export const dynamic = "force-dynamic";

function authorised(header: string | null): boolean {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected || !header) return false;
  const a = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface RcEvent {
  event?: { type?: string; app_user_id?: string; transferred_from?: string[]; transferred_to?: string[] };
}

export async function POST(req: NextRequest) {
  if (!storePurchasesEnabled()) return NextResponse.json({ error: "Not available." }, { status: 503 });
  if (!authorised(req.headers.get("authorization"))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: RcEvent;
  try {
    body = (await req.json()) as RcEvent;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }
  const e = body.event ?? {};
  // Only ids we issued (rv_...); RevenueCat's own anonymous ids never
  // belong to an account.
  const ids = [...new Set([e.app_user_id, ...(e.transferred_from ?? []), ...(e.transferred_to ?? [])])].filter(
    (id): id is string => typeof id === "string" && id.startsWith("rv_")
  );

  for (const id of ids) {
    const result = await syncStorePro(id);
    // RevenueCat retries a failed delivery - worth it only when RevenueCat
    // itself couldn't be read. An id with no account (a test event, a
    // deleted account) won't get better by retrying.
    if (!result.ok && result.reason === "revenuecat_unavailable") {
      return NextResponse.json({ error: "Try again." }, { status: 502 });
    }
  }
  return NextResponse.json({ ok: true, synced: ids.length });
}
