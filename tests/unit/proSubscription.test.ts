import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieveSession: vi.fn(),
  retrieveSubscription: vi.fn(),
  createPortalSession: vi.fn(),
  upsert: vi.fn(),
  patch: vi.fn(),
  query: vi.fn(),
  getUserDoc: vi.fn(),
  sendProTrialStartedEmail: vi.fn(),
  sendProTrialEndingEmail: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieveSession } },
    subscriptions: { retrieve: mocks.retrieveSubscription },
    billingPortal: { sessions: { create: mocks.createPortalSession } },
  }),
}));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { upsert: mocks.upsert, query: mocks.query },
    item: (id: string, pk: string) => ({ patch: (ops: unknown) => mocks.patch(id, pk, ops) }),
  }),
}));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/resend", () => ({
  sendProTrialStartedEmail: mocks.sendProTrialStartedEmail,
  sendProTrialEndingEmail: mocks.sendProTrialEndingEmail,
}));

import {
  createProCheckoutSession,
  applyProSubscriptionFromCheckoutSession,
  applyProSubscriptionRenewed,
  applyProSubscriptionCancelled,
  selfHealProSubscription,
  createBillingPortalSession,
  sendProTrialEndingReminders,
} from "@/lib/payments/proSubscription";
import { isEligibleForProTrial, isInProTrial } from "@/lib/payments/proTrial";

const email = "rider@example.com";
const futureExpiry = new Date(Date.now() - 1000).toISOString(); // already expired, so "not currently Pro"

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_monthly_1";
  process.env.STRIPE_PRICE_PRO_ANNUAL = "price_annual_1";
});

describe("createProCheckoutSession", () => {
  it("returns already_pro without calling Stripe when the account's plan hasn't expired yet", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, plan: { grantedAt: "x", expiresAt: new Date(Date.now() + 86_400_000).toISOString() } });
    const result = await createProCheckoutSession(email, "monthly", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "already_pro" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a subscription-mode session with the monthly price for a brand new account (customer_email, no existing customer)", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    const result = await createProCheckoutSession(email, "monthly", "https://roadverdict.co.uk");

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session123" });
    const args = mocks.create.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.customer_email).toBe(email);
    expect(args.customer).toBeUndefined();
    expect(args.line_items).toEqual([{ price: "price_monthly_1", quantity: 1 }]);
    // A first-time subscriber gets the free trial, with a card taken up front.
    expect(args.subscription_data).toEqual({ metadata: { email }, trial_period_days: 14 });
    expect(args.payment_method_collection).toBe("always");
    expect(args.metadata).toEqual({ email, kind: "pro_subscription" });
    expect(args.success_url).toBe("https://roadverdict.co.uk/pro?subscribed=1&session_id={CHECKOUT_SESSION_ID}");
    expect(args.cancel_url).toBe("https://roadverdict.co.uk/pro");
  });

  it("uses the annual price when asked for the annual interval", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session456" });
    await createProCheckoutSession(email, "annual", "https://roadverdict.co.uk");
    expect(mocks.create.mock.calls[0][0].line_items).toEqual([{ price: "price_annual_1", quantity: 1 }]);
  });

  it("reuses the account's existing Stripe Customer instead of customer_email when one already exists", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, stripeCustomerId: "cus_existing", plan: { grantedAt: "x", expiresAt: futureExpiry } });
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session789" });
    await createProCheckoutSession(email, "monthly", "https://roadverdict.co.uk");
    const args = mocks.create.mock.calls[0][0];
    expect(args.customer).toBe("cus_existing");
    expect(args.customer_email).toBeUndefined();
    // Had Pro before, so no second trial.
    expect(args.subscription_data).toEqual({ metadata: { email } });
  });

  it("never gives an account a second trial, even without a Stripe Customer", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, proTrialStartedAt: "2026-09-01T00:00:00.000Z" });
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session999" });
    await createProCheckoutSession(email, "monthly", "https://roadverdict.co.uk");
    expect(mocks.create.mock.calls[0][0].subscription_data).toEqual({ metadata: { email } });
  });

  it("returns creation_failed when Stripe returns no session url", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ url: null });
    const result = await createProCheckoutSession(email, "monthly", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });

  it("returns creation_failed when Stripe itself throws", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    mocks.create.mockRejectedValue(new Error("stripe down"));
    const result = await createProCheckoutSession(email, "monthly", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });

  it("returns creation_failed, not an unhandled rejection, when the relevant Price env var isn't configured", async () => {
    delete process.env.STRIPE_PRICE_PRO_ANNUAL;
    mocks.getUserDoc.mockResolvedValue(null);
    const result = await createProCheckoutSession(email, "annual", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

function subscription(
  overrides: Partial<{ id: string; status: string; customer: string; email: string; currentPeriodEnd: number; trialEnd: number; cancelAtPeriodEnd: boolean; interval: string }> = {}
) {
  const { id = "sub_1", status = "active", customer = "cus_1", email: metaEmail = email, currentPeriodEnd = 1_800_000_000, trialEnd, cancelAtPeriodEnd = false, interval = "month" } = overrides;
  return {
    id,
    status,
    customer,
    metadata: { email: metaEmail },
    trial_end: trialEnd ?? null,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: null,
    items: { data: [{ current_period_end: currentPeriodEnd, price: { recurring: { interval } } }] },
  };
}

describe("applyProSubscriptionFromCheckoutSession", () => {
  it("does nothing when the session is missing email/subscription/customer", async () => {
    await applyProSubscriptionFromCheckoutSession({ id: "cs_1", metadata: {} } as never);
    expect(mocks.retrieveSubscription).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("retrieves the subscription and grants plan through to its current_period_end", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    mocks.getUserDoc.mockResolvedValue({ email });

    await applyProSubscriptionFromCheckoutSession({
      id: "cs_1",
      subscription: "sub_1",
      customer: "cus_1",
      metadata: { email, kind: "pro_subscription" },
    } as never);

    expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_1");
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        email,
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        plan: expect.objectContaining({ expiresAt: new Date(1_800_000_000 * 1000).toISOString() }),
      })
    );
  });

  it("starts a free trial: records when it ends, marks the account's one trial as used, and emails once", async () => {
    const trialEnd = 1_800_000_000;
    mocks.retrieveSubscription.mockResolvedValue(subscription({ status: "trialing", trialEnd, currentPeriodEnd: trialEnd }));
    mocks.getUserDoc.mockResolvedValue({ id: email, pk: email, email });
    mocks.sendProTrialStartedEmail.mockResolvedValue(undefined);
    mocks.patch.mockResolvedValue(undefined);
    const session = { id: "cs_1", subscription: "sub_1", customer: "cus_1", metadata: { email, kind: "pro_subscription" } } as never;

    await applyProSubscriptionFromCheckoutSession(session);

    const ends = new Date(trialEnd * 1000).toISOString();
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.plan).toEqual(expect.objectContaining({ expiresAt: ends, trialEndsAt: ends, interval: "monthly" }));
    expect(saved.proTrialStartedAt).toEqual(expect.any(String));
    expect(mocks.sendProTrialStartedEmail).toHaveBeenCalledWith(email, { trialEndsAt: ends, interval: "monthly" });
    expect(mocks.patch).toHaveBeenCalledWith(email, email, [{ op: "set", path: "/proTrialEmails", value: { startedFor: "sub_1" } }]);

    // Stripe delivers the same event again: no second email.
    mocks.getUserDoc.mockResolvedValue({ id: email, pk: email, email, proTrialEmails: { startedFor: "sub_1" } });
    await applyProSubscriptionFromCheckoutSession(session);
    expect(mocks.sendProTrialStartedEmail).toHaveBeenCalledTimes(1);
  });

  it("sends no trial email for a subscription that's paid from the start", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription({ interval: "year" }));
    mocks.getUserDoc.mockResolvedValue({ id: email, pk: email, email });
    await applyProSubscriptionFromCheckoutSession({ id: "cs_1", subscription: "sub_1", customer: "cus_1", metadata: { email } } as never);
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.plan.trialEndsAt).toBeUndefined();
    expect(saved.plan.interval).toBe("annual");
    expect(mocks.sendProTrialStartedEmail).not.toHaveBeenCalled();
  });

  it("does not grant plan when the retrieved subscription isn't active/trialing", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription({ status: "incomplete" }));
    mocks.getUserDoc.mockResolvedValue({ email });

    await applyProSubscriptionFromCheckoutSession({
      id: "cs_1",
      subscription: "sub_1",
      customer: "cus_1",
      metadata: { email },
    } as never);

    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when no account exists for the email", async () => {
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    mocks.getUserDoc.mockResolvedValue(null);

    await applyProSubscriptionFromCheckoutSession({
      id: "cs_1",
      subscription: "sub_1",
      customer: "cus_1",
      metadata: { email },
    } as never);

    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("applyProSubscriptionRenewed", () => {
  it("extends plan.expiresAt to the subscription's new current_period_end", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", plan: { grantedAt: "x", expiresAt: "old" } });
    await applyProSubscriptionRenewed(subscription({ currentPeriodEnd: 1_900_000_000 }) as never);
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ plan: expect.objectContaining({ expiresAt: new Date(1_900_000_000 * 1000).toISOString() }) })
    );
  });

  it("does nothing when the subscription has no email in metadata", async () => {
    await applyProSubscriptionRenewed({ ...subscription(), metadata: {} } as never);
    expect(mocks.getUserDoc).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("clears the trial end once the trial has become a paid subscription, and notes a pending cancellation", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, plan: { grantedAt: "x", expiresAt: "old", trialEndsAt: "2026-10-16T00:00:00.000Z" } });
    await applyProSubscriptionRenewed(subscription({ cancelAtPeriodEnd: true }) as never);
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved.plan.trialEndsAt).toBeUndefined();
    expect(saved.plan.cancelling).toBe(true);
  });

  it("does not touch plan when status has moved to past_due", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    await applyProSubscriptionRenewed(subscription({ status: "past_due" }) as never);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("applyProSubscriptionCancelled", () => {
  it("clears plan and stripeSubscriptionId when this is the account's current subscription", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1", plan: { grantedAt: "x", expiresAt: "y" } });
    await applyProSubscriptionCancelled(subscription({ id: "sub_1", status: "canceled" }) as never);
    const written = mocks.upsert.mock.calls[0][0];
    expect(written.plan).toBeUndefined();
    expect(written.stripeSubscriptionId).toBeUndefined();
    expect(written.stripeCustomerId).toBe("cus_1"); // kept, so a resubscribe reuses the same Stripe Customer
  });

  it("ignores a deletion event for a subscription that isn't this account's current one", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, stripeSubscriptionId: "sub_new", plan: { grantedAt: "x", expiresAt: "y" } });
    await applyProSubscriptionCancelled(subscription({ id: "sub_old", status: "canceled" }) as never);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does nothing when no account exists for the email", async () => {
    mocks.getUserDoc.mockResolvedValue(null);
    await applyProSubscriptionCancelled(subscription({ id: "sub_1" }) as never);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("selfHealProSubscription", () => {
  it("does nothing when the session's metadata email doesn't match", async () => {
    mocks.retrieveSession.mockResolvedValue({ metadata: { email: "other@example.com" }, subscription: subscription(), customer: "cus_1" });
    await selfHealProSubscription(email, "cs_1");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("grants plan from the expanded subscription when it matches", async () => {
    mocks.retrieveSession.mockResolvedValue({ metadata: { email }, subscription: subscription(), customer: "cus_1" });
    mocks.getUserDoc.mockResolvedValue({ email });
    await selfHealProSubscription(email, "cs_1");
    expect(mocks.retrieveSession).toHaveBeenCalledWith("cs_1", { expand: ["subscription"] });
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ stripeSubscriptionId: "sub_1" }));
  });

  it("fails soft (no throw) when Stripe itself throws", async () => {
    mocks.retrieveSession.mockRejectedValue(new Error("stripe down"));
    await expect(selfHealProSubscription(email, "cs_1")).resolves.toBeUndefined();
  });
});

describe("createBillingPortalSession", () => {
  it("returns ok:false when the account has no Stripe Customer at all", async () => {
    mocks.getUserDoc.mockResolvedValue({ email });
    const result = await createBillingPortalSession(email, "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false });
    expect(mocks.createPortalSession).not.toHaveBeenCalled();
  });

  it("creates a portal session pointing back at /pro for an existing subscriber", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, stripeCustomerId: "cus_1" });
    mocks.createPortalSession.mockResolvedValue({ url: "https://billing.stripe.com/session_abc" });
    const result = await createBillingPortalSession(email, "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/session_abc" });
    expect(mocks.createPortalSession).toHaveBeenCalledWith({ customer: "cus_1", return_url: "https://roadverdict.co.uk/pro" });
  });

  it("returns ok:false when Stripe itself throws", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, stripeCustomerId: "cus_1" });
    mocks.createPortalSession.mockRejectedValue(new Error("stripe down"));
    const result = await createBillingPortalSession(email, "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false });
  });
});

describe("the free trial rules", () => {
  it("offers one trial, only to an account that has never had a Stripe Pro subscription", () => {
    expect(isEligibleForProTrial(null)).toBe(true);
    expect(isEligibleForProTrial({ email } as never)).toBe(true);
    expect(isEligibleForProTrial({ email, stripeCustomerId: "cus_1" } as never)).toBe(false);
    expect(isEligibleForProTrial({ email, proTrialStartedAt: "2026-09-01T00:00:00.000Z" } as never)).toBe(false);
  });

  it("is in a trial only until the trial's end", () => {
    const now = Date.parse("2026-10-02T12:00:00.000Z");
    expect(isInProTrial({ plan: { grantedAt: "x", expiresAt: "y", trialEndsAt: "2026-10-16T12:00:00.000Z" } } as never, now)).toBe(true);
    expect(isInProTrial({ plan: { grantedAt: "x", expiresAt: "y", trialEndsAt: "2026-10-01T12:00:00.000Z" } } as never, now)).toBe(false);
    expect(isInProTrial({ plan: { grantedAt: "x", expiresAt: "y" } } as never, now)).toBe(false);
  });
});

describe("sendProTrialEndingReminders", () => {
  const now = Date.parse("2026-10-09T09:00:00.000Z");
  const trialEndsAt = "2026-10-16T09:00:00.000Z";
  const user = (overrides: Record<string, unknown> = {}) => ({
    id: email,
    pk: email,
    email,
    stripeSubscriptionId: "sub_1",
    plan: { grantedAt: "x", expiresAt: trialEndsAt, trialEndsAt, interval: "annual" },
    ...overrides,
  });

  it("emails each account whose trial ends within the next 8 days, once", async () => {
    mocks.query.mockReturnValue({ fetchAll: async () => ({ resources: [user()] }) });
    mocks.sendProTrialEndingEmail.mockResolvedValue(undefined);
    mocks.patch.mockResolvedValue(undefined);

    expect(await sendProTrialEndingReminders(now)).toBe(1);

    const params = mocks.query.mock.calls[0][0].parameters;
    expect(params).toEqual([
      { name: "@now", value: "2026-10-09T09:00:00.000Z" },
      { name: "@soon", value: "2026-10-17T09:00:00.000Z" },
    ]);
    expect(mocks.sendProTrialEndingEmail).toHaveBeenCalledWith(email, { trialEndsAt, interval: "annual" });
    expect(mocks.patch).toHaveBeenCalledWith(email, email, [{ op: "set", path: "/proTrialEmails", value: { endingFor: "sub_1" } }]);
  });

  it("skips a trial set to end unpaid, one already reminded, and an account with no subscription", async () => {
    mocks.query.mockReturnValue({
      fetchAll: async () => ({
        resources: [
          user({ plan: { grantedAt: "x", expiresAt: trialEndsAt, trialEndsAt, cancelling: true } }),
          user({ proTrialEmails: { startedFor: "sub_1", endingFor: "sub_1" } }),
          user({ stripeSubscriptionId: undefined }),
        ],
      }),
    });
    expect(await sendProTrialEndingReminders(now)).toBe(0);
    expect(mocks.sendProTrialEndingEmail).not.toHaveBeenCalled();
  });

  it("keeps going when one email fails, without marking it sent", async () => {
    mocks.query.mockReturnValue({ fetchAll: async () => ({ resources: [user(), user({ email: "second@example.com", id: "second@example.com", pk: "second@example.com" })] }) });
    mocks.sendProTrialEndingEmail.mockRejectedValueOnce(new Error("Resend down")).mockResolvedValueOnce(undefined);
    mocks.patch.mockResolvedValue(undefined);
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await sendProTrialEndingReminders(now)).toBe(1);
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    expect(mocks.patch.mock.calls[0][0]).toBe("second@example.com");
  });
});
