// Place at: src/app/api/pro/billing-portal/route.ts
//
// Hands a signed-in Pro subscriber a Stripe-hosted billing portal link -
// cancel, switch monthly/annual, update card, view invoices, all without
// any of that living in this app.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBillingPortalSession } from "@/lib/payments/proSubscription";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const result = await createBillingPortalSession(session.email, appUrl);
  if (!result.ok) {
    return NextResponse.json({ error: "No billing account found for this account." }, { status: 404 });
  }

  return NextResponse.json({ url: result.url });
}
