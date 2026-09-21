// Place at: src/lib/payments/proSubscription.ts
//
// Stripe Billing subscription checkout for Pro - mirrors vdiCheckout.ts's
// pattern (one file owning session creation + the webhook's own "apply"
// functions), but for recurring billing rather than a one-time payment.
// There's no per-token doc to update here: every write lands on the
// signed-in account's own `type: "user"` Cosmos doc (userDoc.ts), the
// same doc grantPremium() writes to manually from /tomasz. Once a real
// subscription exists, plan.expiresAt is kept in lockstep with Stripe's
// own current_period_end - a renewal extends it, a cancellation (at
// period end or immediate) lets it lapse or clears it outright.
import { getContainer } from "@/lib/cosmos";
import { getStripe } from "@/lib/payments/stripe";
import { getUserDoc } from "@/lib/tracker/userDoc";
import type Stripe from "stripe";

export type ProInterval = "monthly" | "annual";

function priceIdFor(interval: ProInterval): string {
  const envVar = interval === "monthly" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_PRO_ANNUAL";
  const priceId = process.env[envVar];
  if (!priceId) throw new Error(`Missing ${envVar} environment variable.`);
  return priceId;
}

export type CreateProCheckoutResult = { ok: true; url: string } | { ok: false; reason: "already_pro" | "creation_failed" };

export async function createProCheckoutSession(email: string, interval: ProInterval, appUrl: string): Promise<CreateProCheckoutResult> {
  const user = await getUserDoc(email);
  if (user?.plan && new Date(user.plan.expiresAt).getTime() > Date.now()) {
    return { ok: false, reason: "already_pro" };
  }

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      // Reuse the existing Stripe Customer for a returning subscriber
      // (e.g. resubscribing after a cancellation) rather than creating a
      // second one - customer_email only ever applies on a brand new
      // Customer, so the two options are mutually exclusive.
      ...(user?.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: email }),
      line_items: [{ price: priceIdFor(interval), quantity: 1 }],
      // Checkout Session metadata (below) isn't copied onto the
      // Subscription object it creates - subscription_data.metadata is
      // the one that actually lands there, which every later
      // customer.subscription.* webhook event needs to resolve back to
      // this account without a cross-partition Cosmos query.
      subscription_data: { metadata: { email } },
      metadata: { email, kind: "pro_subscription" },
      success_url: `${appUrl}/pro?subscribed=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pro`,
    });
    if (!session.url) return { ok: false, reason: "creation_failed" };
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("Pro subscription Checkout Session creation failed:", err);
    return { ok: false, reason: "creation_failed" };
  }
}

// Shared by the webhook's checkout.session.completed/customer.
// subscription.updated handlers and the success-page self-heal below -
// one place that knows how a Stripe Subscription becomes this account's
// `plan`. Only ever grants/extends on a genuinely active subscription;
// anything else (incomplete, past_due, canceled, ...) is left alone
// here; a canceled/deleted subscription is handled by applyProSubscriptionCancelled instead.
async function upsertProSubscriptionState(email: string, customerId: string, subscription: Stripe.Subscription): Promise<void> {
  if (subscription.status !== "active" && subscription.status !== "trialing") return;

  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) {
    console.error(`Stripe webhook: no account found for ${email} on an active Pro subscription.`);
    return;
  }

  const currentPeriodEndSecs = subscription.items.data[0]?.current_period_end;
  if (currentPeriodEndSecs == null) {
    console.error(`Stripe webhook: subscription ${subscription.id} has no current_period_end to extend Pro to.`);
    return;
  }

  user.plan = { grantedAt: new Date().toISOString(), expiresAt: new Date(currentPeriodEndSecs * 1000).toISOString() };
  user.stripeCustomerId = customerId;
  user.stripeSubscriptionId = subscription.id;
  await container.items.upsert(user);
}

// Webhook: checkout.session.completed, mode "subscription" - the
// subscription's first period. Retrieves the Subscription itself rather
// than trusting the session alone, same reasoning as vdiCheckout.ts's
// selfHeal re-verifying directly against Stripe.
export async function applyProSubscriptionFromCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const email = session.metadata?.email;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  if (!email || !subscriptionId || !customerId) {
    console.error("Stripe webhook: pro subscription checkout completed without the expected metadata/ids.");
    return;
  }

  const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
  await upsertProSubscriptionState(email, customerId, subscription);
}

// Webhook: customer.subscription.updated - covers renewals (Stripe
// extends current_period_end on each successful invoice) and any other
// status change that isn't a full cancellation.
export async function applyProSubscriptionRenewed(subscription: Stripe.Subscription): Promise<void> {
  const email = subscription.metadata?.email;
  if (!email) {
    console.error(`Stripe webhook: subscription ${subscription.id} update has no email in metadata.`);
    return;
  }
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  await upsertProSubscriptionState(email, customerId, subscription);
}

// Webhook: customer.subscription.deleted - the subscription is
// genuinely gone. Stripe reports "cancels at period end" as an update
// (still active until then), not a deletion, so by the time this fires
// plan.expiresAt has usually already lapsed on its own - this is the
// safety net for an immediate cancellation (cancel_at_period_end:
// false) rather than the normal portal flow.
export async function applyProSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
  const email = subscription.metadata?.email;
  if (!email) {
    console.error(`Stripe webhook: subscription ${subscription.id} deletion has no email in metadata.`);
    return;
  }

  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) return;
  // Guards against an old, already-superseded subscription's deletion
  // event landing after the account has since started a newer one (e.g.
  // switching monthly -> annual creates a new Subscription in some
  // flows) - never let a stale event revoke the account's current plan.
  if (user.stripeSubscriptionId !== subscription.id) return;

  delete user.plan;
  delete user.stripeSubscriptionId;
  await container.items.upsert(user);
}

// The success-page self-heal, same idea as vdiCheckout.ts's
// selfHealVdiUnlock - covers the case where the browser returns from
// Stripe before the webhook has landed. The webhook remains the
// authoritative path either way.
export async function selfHealProSubscription(email: string, checkoutSessionId: string): Promise<void> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(checkoutSessionId, { expand: ["subscription"] });
    if (session.metadata?.email !== email) return;
    const subscription = session.subscription as Stripe.Subscription | null;
    if (!subscription) return;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!customerId) return;
    await upsertProSubscriptionState(email, customerId, subscription);
  } catch (err) {
    console.error("Pro subscription self-heal failed:", err);
  }
}

// Hands a signed-in Pro subscriber a Stripe-hosted billing portal link -
// cancel, switch monthly/annual, update card, view invoices, all without
// any of that living in this app. Nothing to return for an account that
// was only ever admin-granted Premium (no Stripe Customer exists for it).
export async function createBillingPortalSession(email: string, appUrl: string): Promise<{ ok: true; url: string } | { ok: false }> {
  const user = await getUserDoc(email);
  if (!user?.stripeCustomerId) return { ok: false };
  try {
    const portalSession = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${appUrl}/pro`,
    });
    return { ok: true, url: portalSession.url };
  } catch (err) {
    console.error("Stripe billing portal session creation failed:", err);
    return { ok: false };
  }
}
