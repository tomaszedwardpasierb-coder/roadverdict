// Place at: src/app/api/tracker/buying-guide-vdi-checkout/route.ts
//
// Creates a Stripe Checkout Session for the Buying Guide's standalone,
// pay-per-use VDI check (£9.99, no free tier, no Pro perk - see
// pricing.ts). Requires a session, unlike the report page's own
// vdi-checkout route - a Buying Guide lookup is always a signed-in
// action (the plate lookup itself already requires it), and the
// resulting vdiPurchase doc is bound to this exact email.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBuyingGuideVdiCheckoutSession } from "@/lib/payments/buyingGuideVdiCheckout";

export const dynamic = "force-dynamic";

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

  const { vrm } = body as { vrm?: string };
  const cleaned = vrm?.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) {
    return NextResponse.json({ error: "A registration number is required." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const result = await createBuyingGuideVdiCheckoutSession(session.email, cleaned, "bike", appUrl);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ url: result.url });
}
