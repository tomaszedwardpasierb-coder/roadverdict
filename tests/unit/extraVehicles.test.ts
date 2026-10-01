import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  retrieveSession: vi.fn(),
  retrieveSubscription: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  upsert: vi.fn(),
  getUserDoc: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: mocks.createSession, retrieve: mocks.retrieveSession } },
    subscriptions: { retrieve: mocks.retrieveSubscription, update: mocks.updateSubscription, cancel: mocks.cancelSubscription },
  }),
}));
vi.mock("@/lib/cosmos", () => ({ getContainer: () => ({ items: { upsert: mocks.upsert } }) }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));

import {
  addExtraVehicle,
  removeExtraVehicle,
  getExtraVehiclesStatus,
  applyExtraVehiclesUpdated,
  applyExtraVehiclesCancelled,
  followProSubscription,
  selfHealExtraVehicles,
} from "@/lib/payments/extraVehicles";

const email = "rider@example.com";
const appUrl = "https://roadverdict.co.uk";
const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString();
const periodEndSecs = Math.floor(Date.now() / 1000) + 30 * 86_400;

function proUser(extra?: { quantity: number; paidUntil?: string }) {
  return {
    email,
    plan: { grantedAt: "x", expiresAt: inAMonth },
    stripeSubscriptionId: "sub_pro",
    stripeCustomerId: "cus_1",
    ...(extra ? { extraVehicles: { subscriptionId: "sub_extra", quantity: extra.quantity, paidUntil: extra.paidUntil ?? inAMonth } } : {}),
  };
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_extra",
    status: "active",
    customer: "cus_1",
    metadata: { email, kind: "extra_vehicles" },
    items: { data: [{ id: "si_1", quantity: 1, current_period_end: periodEndSecs }] },
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  delete process.env.STRIPE_PRICE_EXTRA_VEHICLE;
});

describe("addExtraVehicle", () => {
  it("refuses an account without a Stripe Pro subscription", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, plan: { grantedAt: "x", expiresAt: inAMonth } }); // admin-granted
    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: false, reason: "not_eligible" });
    mocks.getUserDoc.mockResolvedValue({ ...proUser(), plan: { grantedAt: "x", expiresAt: new Date(Date.now() - 1000).toISOString() } });
    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: false, reason: "not_eligible" });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("refuses past the most extra vehicles, or when an allowance already gives 4", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 2 }));
    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: false, reason: "at_max" });
    mocks.getUserDoc.mockResolvedValue({ ...proUser(), vehicleAllowance: 4 });
    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: false, reason: "at_max" });
  });

  it("sends the first one through Checkout at £1.99/month, tagged as extra vehicles", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser());
    mocks.createSession.mockResolvedValue({ url: "https://checkout.stripe.com/x" });

    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: true, url: "https://checkout.stripe.com/x" });
    const args = mocks.createSession.mock.calls[0][0];
    expect(args.mode).toBe("subscription");
    expect(args.customer).toBe("cus_1");
    expect(args.line_items).toEqual([
      { price_data: { currency: "gbp", unit_amount: 199, recurring: { interval: "month" }, product_data: { name: "RoadVerdict extra vehicle" } }, quantity: 1 },
    ]);
    expect(args.subscription_data.metadata).toEqual({ email, kind: "extra_vehicles" });
    expect(args.success_url).toContain("/garage?extra_vehicle=1&session_id={CHECKOUT_SESSION_ID}");
  });

  it("uses a configured Stripe price when there is one", async () => {
    process.env.STRIPE_PRICE_EXTRA_VEHICLE = "price_extra";
    mocks.getUserDoc.mockResolvedValue(proUser());
    mocks.createSession.mockResolvedValue({ url: "u" });
    await addExtraVehicle(email, appUrl);
    expect(mocks.createSession.mock.calls[0][0].line_items).toEqual([{ price: "price_extra", quantity: 1 }]);
  });

  it("raises the quantity on an existing subscription, charging now and refusing a declined card", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    mocks.updateSubscription.mockResolvedValue(subscription({ items: { data: [{ id: "si_1", quantity: 2, current_period_end: periodEndSecs }] } }));

    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: true, quantity: 2 });
    expect(mocks.updateSubscription).toHaveBeenCalledWith("sub_extra", {
      items: [{ id: "si_1", quantity: 2 }],
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
    });
    expect(mocks.upsert.mock.calls[0][0].extraVehicles).toMatchObject({ subscriptionId: "sub_extra", quantity: 2 });
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("reports a failure when Stripe refuses (e.g. the card is declined)", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    mocks.retrieveSubscription.mockResolvedValue(subscription());
    mocks.updateSubscription.mockRejectedValue(new Error("card_declined"));
    expect(await addExtraVehicle(email, appUrl)).toEqual({ ok: false, reason: "failed" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("removeExtraVehicle", () => {
  it("has nothing to remove without paid extra vehicles", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1, paidUntil: new Date(Date.now() - 1000).toISOString() }));
    expect(await removeExtraVehicle(email, 1)).toEqual({ ok: false, reason: "none" });
  });

  it("refuses while the garage still uses the slot", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    expect(await removeExtraVehicle(email, 3)).toEqual({ ok: false, reason: "too_many_vehicles" });
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });

  it("lowers the quantity without a refund", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 2 }));
    mocks.retrieveSubscription.mockResolvedValue(subscription({ items: { data: [{ id: "si_1", quantity: 2, current_period_end: periodEndSecs }] } }));
    mocks.updateSubscription.mockResolvedValue(subscription());
    expect(await removeExtraVehicle(email, 2)).toEqual({ ok: true, quantity: 1 });
    expect(mocks.updateSubscription).toHaveBeenCalledWith("sub_extra", { items: [{ id: "si_1", quantity: 1 }], proration_behavior: "none" });
  });

  it("cancels the subscription for the last one", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    mocks.cancelSubscription.mockResolvedValue(subscription({ status: "canceled" }));
    expect(await removeExtraVehicle(email, 2)).toEqual({ ok: true, quantity: 0 });
    expect(mocks.cancelSubscription).toHaveBeenCalledWith("sub_extra");
    expect(mocks.upsert.mock.calls[0][0].extraVehicles).toBeUndefined();
  });
});

describe("getExtraVehiclesStatus", () => {
  it("offers one to a Stripe Pro subscriber with room for more", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    expect(await getExtraVehiclesStatus(email)).toEqual({ canAdd: true, paid: 1 });
  });

  it("offers none to an admin-granted Pro or a full account", async () => {
    mocks.getUserDoc.mockResolvedValue({ email, plan: { grantedAt: "x", expiresAt: inAMonth } });
    expect((await getExtraVehiclesStatus(email)).canAdd).toBe(false);
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 2 }));
    expect(await getExtraVehiclesStatus(email)).toEqual({ canAdd: false, paid: 2 });
  });
});

describe("webhook state", () => {
  it("records quantity and paid-until from an active subscription, never touching Pro", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser());
    await applyExtraVehiclesUpdated(subscription() as never);
    expect(mocks.upsert.mock.calls[0][0].extraVehicles).toEqual({
      subscriptionId: "sub_extra",
      quantity: 1,
      paidUntil: new Date(periodEndSecs * 1000).toISOString(),
    });
    expect(mocks.upsert.mock.calls[0][0].plan).toEqual(proUser().plan);
    expect(mocks.upsert.mock.calls[0][0].stripeSubscriptionId).toBe("sub_pro");
  });

  it("leaves a non-active subscription alone", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser());
    await applyExtraVehiclesUpdated(subscription({ status: "past_due" }) as never);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("clears extra vehicles on cancellation, but ignores a stale subscription", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    await applyExtraVehiclesCancelled(subscription({ id: "sub_old" }) as never);
    expect(mocks.upsert).not.toHaveBeenCalled();
    await applyExtraVehiclesCancelled(subscription() as never);
    expect(mocks.upsert.mock.calls[0][0].extraVehicles).toBeUndefined();
  });

  it("self-heals only for the signed-in account's own extra vehicles checkout", async () => {
    mocks.retrieveSession.mockResolvedValue({ metadata: { email: "someone@example.com", kind: "extra_vehicles" }, subscription: subscription() });
    await selfHealExtraVehicles(email, "cs_1");
    expect(mocks.upsert).not.toHaveBeenCalled();
    mocks.retrieveSession.mockResolvedValue({ metadata: { email, kind: "extra_vehicles" }, subscription: subscription() });
    mocks.getUserDoc.mockResolvedValue(proUser());
    await selfHealExtraVehicles(email, "cs_1");
    expect(mocks.upsert).toHaveBeenCalled();
  });
});

describe("followProSubscription", () => {
  const pro = (overrides: Record<string, unknown> = {}) => ({
    id: "sub_pro",
    metadata: { email },
    cancel_at_period_end: false,
    cancel_at: null,
    items: { data: [{ current_period_end: periodEndSecs + 1000 }] },
    ...overrides,
  });

  it("cancels extra vehicles when Pro is deleted", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    await followProSubscription(pro() as never, true);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith("sub_extra");
  });

  it("ends extra vehicles when Pro ends, and un-ends them if Pro is resumed", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    mocks.retrieveSubscription.mockResolvedValue(subscription({ cancel_at: null }));
    await followProSubscription(pro({ cancel_at_period_end: true }) as never, false);
    expect(mocks.updateSubscription).toHaveBeenCalledWith("sub_extra", { cancel_at: periodEndSecs + 1000, proration_behavior: "none" });

    mocks.updateSubscription.mockReset();
    mocks.retrieveSubscription.mockResolvedValue(subscription({ cancel_at: periodEndSecs + 1000 }));
    await followProSubscription(pro() as never, false);
    expect(mocks.updateSubscription).toHaveBeenCalledWith("sub_extra", { cancel_at: "", proration_behavior: "none" });
  });

  it("does nothing when already in step, or for an older Pro subscription", async () => {
    mocks.getUserDoc.mockResolvedValue(proUser({ quantity: 1 }));
    mocks.retrieveSubscription.mockResolvedValue(subscription({ cancel_at: null }));
    await followProSubscription(pro() as never, false);
    await followProSubscription(pro({ id: "sub_old" }) as never, true);
    expect(mocks.updateSubscription).not.toHaveBeenCalled();
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
  });
});
