// Place at: src/lib/payments/extraVehicles.ts
//
// Extra vehicles on top of Pro's two, £1.99/month each, up to
// MAX_EXTRA_VEHICLES. Their own monthly Stripe subscription (quantity =
// how many extra vehicles), separate from Pro's - Pro can be annual, and
// Stripe won't mix monthly and annual prices on one subscription.
// Same shape as proSubscription.ts: Checkout for the first one, the
// webhook (plus a success-page self-heal) writing UserDoc.extraVehicles.
// Every later change is a quantity change on that same subscription.
//
// Only sold to accounts paying for Pro through Stripe: their extra
// vehicles follow Pro's own cancellation (followProSubscription below),
// which an admin-granted Pro has no Stripe event to drive. Admin-granted
// accounts get extra vehicles from /tomasz instead (vehicleAllowance).
import { getContainer } from "@/lib/cosmos";
import { getStripe } from "@/lib/payments/stripe";
import { getUserDoc } from "@/lib/tracker/userDoc";
import { paidExtraVehicles } from "@/lib/subscriptions";
import { EXTRA_VEHICLE_MONTHLY_PENCE } from "@/lib/proPlan";
import { MAX_EXTRA_VEHICLES, MAX_GRANTED_VEHICLES, vehicleLimitFor } from "@/lib/tracker/vehicleLimit";
import type Stripe from "stripe";

export const EXTRA_VEHICLES_KIND = "extra_vehicles";

export function isExtraVehiclesSubscription(subscription: Stripe.Subscription): boolean {
  return subscription.metadata?.kind === EXTRA_VEHICLES_KIND;
}

// A Stripe Price set up in the dashboard wins if one is configured;
// otherwise the price is described inline, so nothing has to be set up
// in Stripe before this can sell.
function lineItem(): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceId = process.env.STRIPE_PRICE_EXTRA_VEHICLE;
  if (priceId) return { price: priceId, quantity: 1 };
  return {
    price_data: {
      currency: "gbp",
      unit_amount: EXTRA_VEHICLE_MONTHLY_PENCE,
      recurring: { interval: "month" },
      product_data: { name: "RoadVerdict extra vehicle" },
    },
    quantity: 1,
  };
}

function proIsActive(user: { plan?: { expiresAt: string } } | null): boolean {
  return !!user?.plan && new Date(user.plan.expiresAt).getTime() > Date.now();
}

export interface ExtraVehiclesStatus {
  // Can buy (another) one right now.
  canAdd: boolean;
  // How many it pays for at the moment.
  paid: number;
}

export async function getExtraVehiclesStatus(email: string): Promise<ExtraVehiclesStatus> {
  const user = await getUserDoc(email);
  const paid = paidExtraVehicles(user);
  const pro = proIsActive(user);
  const canAdd =
    pro &&
    !!user?.stripeSubscriptionId &&
    paid < MAX_EXTRA_VEHICLES &&
    vehicleLimitFor(pro, user?.vehicleAllowance, paid) < MAX_GRANTED_VEHICLES;
  return { canAdd, paid };
}

export type AddExtraVehicleResult =
  | { ok: true; url: string }
  | { ok: true; quantity: number }
  | { ok: false; reason: "not_eligible" | "at_max" | "failed" };

// The first extra vehicle goes through Stripe Checkout; each one after
// that raises the quantity on the existing subscription and charges the
// card on file for the rest of this month there and then.
export async function addExtraVehicle(email: string, appUrl: string): Promise<AddExtraVehicleResult> {
  const user = await getUserDoc(email);
  if (!user || !proIsActive(user) || !user.stripeSubscriptionId) return { ok: false, reason: "not_eligible" };
  const paid = paidExtraVehicles(user);
  if (paid >= MAX_EXTRA_VEHICLES || vehicleLimitFor(true, user.vehicleAllowance, paid) >= MAX_GRANTED_VEHICLES) {
    return { ok: false, reason: "at_max" };
  }

  try {
    if (user.extraVehicles && paid > 0) {
      const current = await getStripe().subscriptions.retrieve(user.extraVehicles.subscriptionId);
      const item = current.items.data[0];
      if (current.status === "active" && item) {
        const updated = await getStripe().subscriptions.update(current.id, {
          items: [{ id: item.id, quantity: (item.quantity ?? 1) + 1 }],
          proration_behavior: "always_invoice",
          // Refuses the change outright if the card is declined, rather
          // than granting a vehicle that was never paid for.
          payment_behavior: "error_if_incomplete",
        });
        await upsertExtraVehiclesState(email, updated);
        return { ok: true, quantity: (item.quantity ?? 1) + 1 };
      }
    }

    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      ...(user.stripeCustomerId ? { customer: user.stripeCustomerId } : { customer_email: email }),
      line_items: [lineItem()],
      subscription_data: { metadata: { email, kind: EXTRA_VEHICLES_KIND } },
      metadata: { email, kind: EXTRA_VEHICLES_KIND },
      success_url: `${appUrl}/garage?extra_vehicle=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/garage`,
    });
    if (!session.url) return { ok: false, reason: "failed" };
    return { ok: true, url: session.url };
  } catch (err) {
    console.error("Adding an extra vehicle failed:", err);
    return { ok: false, reason: "failed" };
  }
}

export type RemoveExtraVehicleResult = { ok: true; quantity: number } | { ok: false; reason: "none" | "too_many_vehicles" | "failed" };

// Drops one extra vehicle straight away - no refund for the month
// already paid, and nothing more charged for it. Refused while the
// garage would be over its new limit, so nobody loses a vehicle slot
// they're still using. The last one ends the subscription.
export async function removeExtraVehicle(email: string, activeVehicles: number): Promise<RemoveExtraVehicleResult> {
  const user = await getUserDoc(email);
  const paid = paidExtraVehicles(user);
  if (!user?.extraVehicles || paid === 0) return { ok: false, reason: "none" };
  if (activeVehicles > vehicleLimitFor(proIsActive(user), user.vehicleAllowance, paid - 1)) {
    return { ok: false, reason: "too_many_vehicles" };
  }

  try {
    if (paid === 1) {
      const cancelled = await getStripe().subscriptions.cancel(user.extraVehicles.subscriptionId);
      await applyExtraVehiclesCancelled(cancelled);
      return { ok: true, quantity: 0 };
    }
    const current = await getStripe().subscriptions.retrieve(user.extraVehicles.subscriptionId);
    const item = current.items.data[0];
    if (!item) return { ok: false, reason: "failed" };
    const updated = await getStripe().subscriptions.update(current.id, {
      items: [{ id: item.id, quantity: paid - 1 }],
      proration_behavior: "none",
    });
    await upsertExtraVehiclesState(email, updated);
    return { ok: true, quantity: paid - 1 };
  } catch (err) {
    console.error("Removing an extra vehicle failed:", err);
    return { ok: false, reason: "failed" };
  }
}

// The one place a Stripe Subscription becomes UserDoc.extraVehicles.
// Anything not active (past_due, unpaid, ...) is left alone, the same
// as Pro - paidUntil simply runs out if it's never renewed.
async function upsertExtraVehiclesState(email: string, subscription: Stripe.Subscription): Promise<void> {
  if (subscription.status !== "active" && subscription.status !== "trialing") return;
  const item = subscription.items.data[0];
  if (!item?.current_period_end) {
    console.error(`Stripe webhook: extra vehicles subscription ${subscription.id} has no current period.`);
    return;
  }
  const user = await getUserDoc(email);
  if (!user) {
    console.error(`Stripe webhook: no account found for ${email} on an extra vehicles subscription.`);
    return;
  }
  user.extraVehicles = {
    subscriptionId: subscription.id,
    quantity: Math.min(MAX_EXTRA_VEHICLES, item.quantity ?? 1),
    paidUntil: new Date(item.current_period_end * 1000).toISOString(),
  };
  if (!user.stripeCustomerId) {
    user.stripeCustomerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  }
  await getContainer().items.upsert(user);
}

// Webhook: checkout.session.completed for an extra vehicles Checkout.
export async function applyExtraVehiclesFromCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
  const email = session.metadata?.email;
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!email || !subscriptionId) {
    console.error("Stripe webhook: extra vehicles checkout completed without the expected metadata/ids.");
    return;
  }
  await upsertExtraVehiclesState(email, await getStripe().subscriptions.retrieve(subscriptionId));
}

// Webhook: customer.subscription.updated - renewals and quantity changes
// (including any made from Stripe's own billing portal).
export async function applyExtraVehiclesUpdated(subscription: Stripe.Subscription): Promise<void> {
  const email = subscription.metadata?.email;
  if (!email) {
    console.error(`Stripe webhook: extra vehicles subscription ${subscription.id} has no email in metadata.`);
    return;
  }
  await upsertExtraVehiclesState(email, subscription);
}

// Webhook: customer.subscription.deleted (and removeExtraVehicle's own
// last-one cancel). Ignores a stale event for an older subscription.
export async function applyExtraVehiclesCancelled(subscription: Stripe.Subscription): Promise<void> {
  const email = subscription.metadata?.email;
  if (!email) return;
  const user = await getUserDoc(email);
  if (!user?.extraVehicles || user.extraVehicles.subscriptionId !== subscription.id) return;
  delete user.extraVehicles;
  await getContainer().items.upsert(user);
}

// Extra vehicles are worthless without Pro, so they end when Pro ends:
// when Pro is set to cancel, the extra vehicles subscription is set to
// cancel at the same moment (and un-set if Pro is resumed); when Pro is
// gone, it's cancelled there and then. Called from the webhook for every
// Pro subscription update/deletion.
export async function followProSubscription(proSubscription: Stripe.Subscription, deleted: boolean): Promise<void> {
  const email = proSubscription.metadata?.email;
  if (!email) return;
  try {
    const user = await getUserDoc(email);
    const extra = user?.extraVehicles;
    if (!extra || user.stripeSubscriptionId !== proSubscription.id) return;
    if (deleted) {
      await getStripe().subscriptions.cancel(extra.subscriptionId);
      return;
    }
    const proEnds = proSubscription.cancel_at_period_end
      ? proSubscription.items.data[0]?.current_period_end ?? null
      : proSubscription.cancel_at ?? null;
    const current = await getStripe().subscriptions.retrieve(extra.subscriptionId);
    if (current.status === "canceled" || (current.cancel_at ?? null) === proEnds) return;
    await getStripe().subscriptions.update(extra.subscriptionId, { cancel_at: proEnds ?? "", proration_behavior: "none" });
  } catch (err) {
    console.error("Keeping extra vehicles in step with Pro failed:", err);
  }
}

// Success-page self-heal, same idea as selfHealProSubscription.
export async function selfHealExtraVehicles(email: string, checkoutSessionId: string): Promise<void> {
  try {
    const session = await getStripe().checkout.sessions.retrieve(checkoutSessionId, { expand: ["subscription"] });
    if (session.metadata?.email !== email || session.metadata?.kind !== EXTRA_VEHICLES_KIND) return;
    const subscription = session.subscription as Stripe.Subscription | null;
    if (subscription) await upsertExtraVehiclesState(email, subscription);
  } catch (err) {
    console.error("Extra vehicles self-heal failed:", err);
  }
}
