// Place at: src/app/api/cars/buying-guide-vdi-checkout/route.ts
//
// Car equivalent of tracker/buying-guide-vdi-checkout/route.ts - same
// mechanic, just "car" instead of "bike" as the vehicleKind.
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
  const result = await createBuyingGuideVdiCheckoutSession(session.email, cleaned, "car", appUrl);
  if (!result.ok) {
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
  if ("freeReportReady" in result) {
    return NextResponse.json({ freeReportReady: true, vdiPurchaseId: result.purchaseId });
  }

  return NextResponse.json({ url: result.url });
}
