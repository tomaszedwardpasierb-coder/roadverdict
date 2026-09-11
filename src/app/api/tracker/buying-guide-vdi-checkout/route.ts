// Place at: src/app/api/tracker/buying-guide-vdi-checkout/route.ts
//
// Creates a Stripe Checkout Session for the Buying Guide's vehicle-
// history report - tiered pricing by account status, see
// buyingGuideReportTier.ts/pricing.ts. Requires a session, unlike the
// report page's own vdi-checkout route - a Buying Guide lookup is
// always a signed-in action (the plate lookup itself already requires
// it), and the resulting vdiPurchase doc is bound to this exact email.
// Tier/price is never accepted from the client - only `vrm`.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createBuyingGuideVdiCheckoutSession, type BuyingGuideReturnContext } from "@/lib/payments/buyingGuideVdiCheckout";

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

  const { vrm, returnTo } = body as { vrm?: string; returnTo?: string };
  const cleaned = vrm?.trim().toUpperCase().replace(/\s+/g, "");
  if (!cleaned) {
    return NextResponse.json({ error: "A registration number is required." }, { status: 400 });
  }
  // Strict allow-list, not a raw client-supplied path - see the car
  // route's identical comment on this same check.
  const returnContext: BuyingGuideReturnContext = returnTo === "dashboard" ? "dashboard" : "public";

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const result = await createBuyingGuideVdiCheckoutSession(session.email, cleaned, "bike", appUrl, returnContext);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
  if ("freeReportReady" in result) {
    return NextResponse.json({ freeReportReady: true, vdiPurchaseId: result.purchaseId });
  }

  return NextResponse.json({ url: result.url });
}
