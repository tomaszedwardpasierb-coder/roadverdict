// Place at: src/lib/payments/stripe.ts
//
// Lazily-created singleton, same reason as getResend() (resend.ts) and
// getContainer() (cosmos.ts): Next.js inspects this module during
// `next build`, and constructing the Stripe client eagerly at import
// time would throw if STRIPE_SECRET_KEY isn't set at build time (it's
// only ever needed at actual request time).
import Stripe from "stripe";

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripeInstance) return stripeInstance;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  stripeInstance = new Stripe(apiKey);
  return stripeInstance;
}
