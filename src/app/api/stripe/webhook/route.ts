// Place at: src/app/api/stripe/webhook/route.ts
//
// New pattern for this codebase - the existing "external POST" precedent
// is the cron routes' static Bearer-token check, but a real payment
// webhook needs genuine HMAC signature verification. Reads the raw body
// via req.text() (never .json() first) so Stripe's signature check
// actually passes - middleware.ts only sets a CSP header and never
// touches the body, so nothing upstream interferes with that.
//
// Deliberately minimal: only ever writes the payment fields
// (unlockedAt/stripeSessionId/amountPaidPence/currency) via
// applyVdiUnlockFromWebhookSession - the VDG fetch + AI summary are done
// lazily by the report page itself on next view, kept out of this
// webhook's latency/failure path entirely.
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { applyVdiUnlockFromWebhookSession } from "@/lib/payments/vdiCheckout";
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    console.error("Stripe webhook: missing signature header or STRIPE_WEBHOOK_SECRET.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const token = session.metadata?.token;
    const vehicleKind = session.metadata?.vehicleKind as VehicleKind | undefined;
    if (token && (vehicleKind === "bike" || vehicleKind === "car") && session.payment_status === "paid") {
      await applyVdiUnlockFromWebhookSession(token, vehicleKind, {
        id: session.id,
        amount_total: session.amount_total,
        currency: session.currency,
      });
    }
  }

  return NextResponse.json({ received: true });
}
