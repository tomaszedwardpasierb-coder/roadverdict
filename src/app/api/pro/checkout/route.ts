// Place at: src/app/api/pro/checkout/route.ts
//
// Creates a Stripe Checkout Session for a real Pro subscription -
// mirrors buying-guide-vdi-checkout's route (session required, appUrl
// from env) but for recurring billing via proSubscription.ts instead of
// a one-time purchase.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { createProCheckoutSession, type ProInterval } from "@/lib/payments/proSubscription";

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

  const { interval } = body as { interval?: ProInterval };
  if (interval !== "monthly" && interval !== "annual") {
    return NextResponse.json({ error: "interval must be 'monthly' or 'annual'." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const result = await createProCheckoutSession(session.email, interval, appUrl);
  if (!result.ok) {
    const status = result.reason === "already_pro" ? 409 : 500;
    const error = result.reason === "already_pro" ? "Your account already has Pro." : "Could not start checkout. Please try again.";
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ url: result.url });
}
