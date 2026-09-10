// Place at: src/app/api/tracker/vdi-checkout/route.ts
//
// Creates a Stripe Checkout Session for the bike report's one-time
// Independent Vehicle Check unlock. Deliberately no session/auth check -
// the report itself is anonymous-accessible behind the plate gate
// (PlateGate.tsx), and this route discloses nothing sensitive on its
// own; the "Unlock" button that calls this only ever renders once a
// visitor has already passed that gate.
import { NextRequest, NextResponse } from "next/server";
import { createVdiCheckoutSession } from "@/lib/payments/vdiCheckout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { token } = body as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "A report token is required." }, { status: 400 });
  }

  const appUrl = process.env.APP_URL ?? "https://roadverdict.co.uk";
  const result = await createVdiCheckoutSession(token, "bike", appUrl);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "already_unlocked" ? 409 : 500;
    const error =
      result.reason === "not_found"
        ? "Report link not found or expired."
        : result.reason === "already_unlocked"
        ? "This report's Independent Vehicle Check has already been unlocked."
        : "Could not start checkout. Please try again.";
    return NextResponse.json({ error }, { status });
  }

  return NextResponse.json({ url: result.url });
}
