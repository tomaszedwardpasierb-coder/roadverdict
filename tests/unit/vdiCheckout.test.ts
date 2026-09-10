import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  resolveShareToken: vi.fn(),
  resolveCarShareToken: vi.fn(),
  updateShareLinkVdiUnlock: vi.fn(),
  updateCarShareLinkVdiUnlock: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } } }),
}));
vi.mock("@/lib/tracker/shareLink", () => ({
  resolveShareToken: mocks.resolveShareToken,
  updateShareLinkVdiUnlock: mocks.updateShareLinkVdiUnlock,
}));
vi.mock("@/lib/tracker/carShareLink", () => ({
  resolveCarShareToken: mocks.resolveCarShareToken,
  updateCarShareLinkVdiUnlock: mocks.updateCarShareLinkVdiUnlock,
}));

import { createVdiCheckoutSession, selfHealVdiUnlock, applyVdiUnlockFromWebhookSession } from "@/lib/payments/vdiCheckout";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("createVdiCheckoutSession", () => {
  it("returns not_found when the token doesn't resolve", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);
    const result = await createVdiCheckoutSession("tok_abc", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("returns already_unlocked without creating a session when vdiUnlock is already set", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "a@example.com", bikeId: "b1", vdiUnlock: { unlockedAt: "x", stripeSessionId: "s", amountPaidPence: 799, currency: "gbp" } });
    const result = await createVdiCheckoutSession("tok_abc", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "already_unlocked" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("creates a bike checkout session at £9.99 with the right metadata and success/cancel URLs", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "a@example.com", bikeId: "b1" });
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    const result = await createVdiCheckoutSession("tok_abc", "bike", "https://roadverdict.co.uk");

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session123" });
    const args = mocks.create.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.metadata).toEqual({ token: "tok_abc", vehicleKind: "bike" });
    expect(args.client_reference_id).toBe("tok_abc");
    expect(args.line_items[0].price_data.unit_amount).toBe(999);
    expect(args.line_items[0].price_data.currency).toBe("gbp");
    expect(args.success_url).toBe("https://roadverdict.co.uk/report/tok_abc/detailed?session_id={CHECKOUT_SESSION_ID}");
    expect(args.cancel_url).toBe("https://roadverdict.co.uk/report/tok_abc/detailed");
  });

  it("creates a car checkout session at £13.99 pointing at the car report path", async () => {
    mocks.resolveCarShareToken.mockResolvedValue({ email: "a@example.com", carId: "c1" });
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session456" });

    const result = await createVdiCheckoutSession("tok_xyz", "car", "https://roadverdict.co.uk");

    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session456" });
    const args = mocks.create.mock.calls[0][0];
    expect(args.line_items[0].price_data.unit_amount).toBe(1399);
    expect(args.success_url).toBe("https://roadverdict.co.uk/car-report/tok_xyz/detailed?session_id={CHECKOUT_SESSION_ID}");
  });

  it("returns creation_failed when Stripe returns no session url", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "a@example.com", bikeId: "b1" });
    mocks.create.mockResolvedValue({ url: null });
    const result = await createVdiCheckoutSession("tok_abc", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });

  it("returns creation_failed when Stripe itself throws", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "a@example.com", bikeId: "b1" });
    mocks.create.mockRejectedValue(new Error("stripe down"));
    const result = await createVdiCheckoutSession("tok_abc", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });
});

describe("selfHealVdiUnlock", () => {
  it("returns null when the Stripe session isn't paid", async () => {
    mocks.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "unpaid", metadata: { token: "tok_abc", vehicleKind: "bike" } });
    expect(await selfHealVdiUnlock("tok_abc", "bike", "cs_1")).toBeNull();
    expect(mocks.updateShareLinkVdiUnlock).not.toHaveBeenCalled();
  });

  it("returns null when the session's metadata doesn't match the token/vehicleKind given", async () => {
    mocks.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "paid", metadata: { token: "different-token", vehicleKind: "bike" } });
    expect(await selfHealVdiUnlock("tok_abc", "bike", "cs_1")).toBeNull();
    expect(mocks.updateShareLinkVdiUnlock).not.toHaveBeenCalled();
  });

  it("applies the unlock and returns it when the session is genuinely paid and matches", async () => {
    mocks.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "paid", amount_total: 799, currency: "gbp", metadata: { token: "tok_abc", vehicleKind: "bike" } });
    mocks.updateShareLinkVdiUnlock.mockResolvedValue({ vdiUnlock: { unlockedAt: "2026-01-01T00:00:00.000Z", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" } });

    const result = await selfHealVdiUnlock("tok_abc", "bike", "cs_1");

    expect(result).toEqual({ unlockedAt: "2026-01-01T00:00:00.000Z", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" });
    expect(mocks.updateShareLinkVdiUnlock).toHaveBeenCalledWith("tok_abc", expect.objectContaining({ stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" }));
  });

  it("routes a car token to updateCarShareLinkVdiUnlock, not the bike mutator", async () => {
    mocks.retrieve.mockResolvedValue({ id: "cs_2", payment_status: "paid", amount_total: 999, currency: "gbp", metadata: { token: "tok_xyz", vehicleKind: "car" } });
    mocks.updateCarShareLinkVdiUnlock.mockResolvedValue({ vdiUnlock: { unlockedAt: "x", stripeSessionId: "cs_2", amountPaidPence: 999, currency: "gbp" } });

    await selfHealVdiUnlock("tok_xyz", "car", "cs_2");

    expect(mocks.updateCarShareLinkVdiUnlock).toHaveBeenCalled();
    expect(mocks.updateShareLinkVdiUnlock).not.toHaveBeenCalled();
  });

  it("fails soft to null when Stripe itself throws", async () => {
    mocks.retrieve.mockRejectedValue(new Error("stripe down"));
    expect(await selfHealVdiUnlock("tok_abc", "bike", "cs_1")).toBeNull();
  });
});

describe("applyVdiUnlockFromWebhookSession", () => {
  it("does nothing when the token doesn't resolve to any share link", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);
    await applyVdiUnlockFromWebhookSession("tok_abc", "bike", { id: "cs_1", amount_total: 799, currency: "gbp" });
    expect(mocks.updateShareLinkVdiUnlock).not.toHaveBeenCalled();
  });

  it("skips the write when this exact session has already been recorded (webhook retry / already self-healed)", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "a@example.com", bikeId: "b1", vdiUnlock: { unlockedAt: "x", stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" } });
    await applyVdiUnlockFromWebhookSession("tok_abc", "bike", { id: "cs_1", amount_total: 799, currency: "gbp" });
    expect(mocks.updateShareLinkVdiUnlock).not.toHaveBeenCalled();
  });

  it("applies the unlock when the link exists and isn't already recorded for this session", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "a@example.com", bikeId: "b1" });
    await applyVdiUnlockFromWebhookSession("tok_abc", "bike", { id: "cs_1", amount_total: 799, currency: "gbp" });
    expect(mocks.updateShareLinkVdiUnlock).toHaveBeenCalledWith("tok_abc", expect.objectContaining({ stripeSessionId: "cs_1", amountPaidPence: 799, currency: "gbp" }));
  });

  it("routes a car token to updateCarShareLinkVdiUnlock", async () => {
    mocks.resolveCarShareToken.mockResolvedValue({ email: "a@example.com", carId: "c1" });
    await applyVdiUnlockFromWebhookSession("tok_xyz", "car", { id: "cs_2", amount_total: 999, currency: "gbp" });
    expect(mocks.updateCarShareLinkVdiUnlock).toHaveBeenCalledWith("tok_xyz", expect.objectContaining({ stripeSessionId: "cs_2" }));
    expect(mocks.updateShareLinkVdiUnlock).not.toHaveBeenCalled();
  });
});
