// Place at: src/lib/payments/proStats.ts
//
// Pro's end of the growth scorecard - trials, paying subscribers,
// conversions and renewals - read live from Stripe for /tomasz rather than
// counted by the webhook, so it can't drift from what Stripe actually
// charged. Extra-vehicle subscriptions (extraVehicles.ts) are left out:
// this is about Pro itself. Admin-only; nothing here is stored.
import type Stripe from "stripe";
import { getStripe } from "@/lib/payments/stripe";
import { isExtraVehiclesSubscription } from "@/lib/payments/extraVehicles";

const DAY_SECS = 86_400;
const WINDOW_DAYS = 30;
// A safety stop for the paging loops - far above what this account holds.
const MAX_ITEMS = 2_000;

export type ProStats = {
  payingMonthly: number;
  payingAnnual: number;
  // Paying, but set to end when the current period runs out.
  payingCancelling: number;
  // Stripe couldn't take the latest payment and is retrying.
  paymentFailing: number;
  inTrial: number;
  // In a trial that's set to end without becoming a paid subscription.
  trialsCancelling: number;
  // Last 30 days:
  started: number;
  trialsStarted: number;
  trialsConverted: number;
  trialsEndedUnpaid: number;
  renewalPayments: number;
  ended: number;
};

function isProSubscription(s: Stripe.Subscription): boolean {
  return !isExtraVehiclesSubscription(s) && !!s.metadata?.email;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = invoice.parent?.subscription_details?.subscription;
  if (!sub) return null;
  return typeof sub === "string" ? sub : sub.id;
}

// The pure half, so it can be tested on plain objects.
export function summariseProSubscriptions(allSubscriptions: Stripe.Subscription[], paidInvoices: Stripe.Invoice[], nowMs = Date.now()): ProStats {
  const now = Math.floor(nowMs / 1000);
  const since = now - WINDOW_DAYS * DAY_SECS;
  const subs = allSubscriptions.filter(isProSubscription);
  const proIds = new Set(subs.map((s) => s.id));
  const inWindow = (t: number | null | undefined) => t != null && t >= since && t <= now;

  const stats: ProStats = {
    payingMonthly: 0,
    payingAnnual: 0,
    payingCancelling: 0,
    paymentFailing: 0,
    inTrial: 0,
    trialsCancelling: 0,
    started: 0,
    trialsStarted: 0,
    trialsConverted: 0,
    trialsEndedUnpaid: 0,
    renewalPayments: 0,
    ended: 0,
  };

  for (const s of subs) {
    const cancelling = s.cancel_at_period_end || s.cancel_at != null;
    if (s.status === "active") {
      if (s.items.data[0]?.price.recurring?.interval === "year") stats.payingAnnual++;
      else stats.payingMonthly++;
      if (cancelling) stats.payingCancelling++;
    } else if (s.status === "trialing") {
      stats.inTrial++;
      if (cancelling) stats.trialsCancelling++;
    } else if (s.status === "past_due" || s.status === "unpaid") {
      stats.paymentFailing++;
    }

    if (inWindow(s.created)) {
      stats.started++;
      if (s.trial_start != null) stats.trialsStarted++;
    }
    if (s.trial_end != null && inWindow(s.trial_end)) {
      if (s.status === "active") stats.trialsConverted++;
      else if (s.status !== "trialing") stats.trialsEndedUnpaid++;
    }
    if (inWindow(s.ended_at)) stats.ended++;
  }

  for (const invoice of paidInvoices) {
    const subId = invoiceSubscriptionId(invoice);
    if (invoice.billing_reason === "subscription_cycle" && invoice.amount_paid > 0 && subId && proIds.has(subId) && inWindow(invoice.created)) {
      stats.renewalPayments++;
    }
  }

  return stats;
}

export async function getProStats(nowMs = Date.now()): Promise<ProStats> {
  const stripe = getStripe();
  const since = Math.floor(nowMs / 1000) - WINDOW_DAYS * DAY_SECS;

  const subscriptions: Stripe.Subscription[] = [];
  for await (const s of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    subscriptions.push(s);
    if (subscriptions.length >= MAX_ITEMS) break;
  }
  const invoices: Stripe.Invoice[] = [];
  for await (const invoice of stripe.invoices.list({ status: "paid", created: { gte: since }, limit: 100 })) {
    invoices.push(invoice);
    if (invoices.length >= MAX_ITEMS) break;
  }
  return summariseProSubscriptions(subscriptions, invoices, nowMs);
}
