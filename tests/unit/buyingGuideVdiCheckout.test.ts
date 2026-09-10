import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  createVdiPurchase: vi.fn(),
  getVdiPurchase: vi.fn(),
  markVdiPurchasePaid: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } } }),
}));
vi.mock("@/lib/tracker/vdiPurchase", () => ({
  createVdiPurchase: mocks.createVdiPurchase,
  getVdiPurchase: mocks.getVdiPurchase,
  markVdiPurchasePaid: mocks.markVdiPurchasePaid,
}));

import {
  createBuyingGuideVdiCheckoutSession,
  selfHealBuyingGuideVdiPurchase,
  applyBuyingGuideVdiPurchaseFromWebhookSession,
} from "@/lib/payments/buyingGuideVdiCheckout";

function purchase(overrides: Partial<{ id: string; status: string }> = {}) {
  return {
    id: overrides.id ?? "purchase123",
    pk: overrides.id ?? "purchase123",
    type: "vdiPurchase" as const,
    email: "buyer@example.com",
    vrm: "AB12CDE",
    vehicleKind: "bike" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: overrides.status ?? "pending",
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("createBuyingGuideVdiCheckoutSession", () => {
  it("creates the purchase doc first, then a £9.99 checkout session carrying its id as metadata", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase());
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    const result = await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");

    expect(mocks.createVdiPurchase).toHaveBeenCalledWith("buyer@example.com", "AB12CDE", "bike");
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session123" });
    const args = mocks.create.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.client_reference_id).toBe("purchase123");
    expect(args.metadata).toEqual({ purchaseId: "purchase123", vehicleKind: "bike" });
    expect(args.line_items[0].price_data.unit_amount).toBe(999);
    expect(args.line_items[0].price_data.currency).toBe("gbp");
    expect(args.success_url).toBe(
      "https://roadverdict.co.uk/buying-guide?vdiPurchaseId=purchase123&vrm=AB12CDE&session_id={CHECKOUT_SESSION_ID}"
    );
    expect(args.cancel_url).toBe("https://roadverdict.co.uk/buying-guide");
  });

  it("points a car purchase at the car buying-guide path", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase());
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session456" });

    await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "car", "https://roadverdict.co.uk");

    const args = mocks.create.mock.calls[0][0];
    expect(args.success_url).toContain("https://roadverdict.co.uk/cars/buying-guide?");
    expect(args.cancel_url).toBe("https://roadverdict.co.uk/cars/buying-guide");
  });

  it("returns creation_failed when Stripe returns no session url", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase());
    mocks.create.mockResolvedValue({ url: null });
    const result = await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });

  it("returns creation_failed when Stripe itself throws", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase());
    mocks.create.mockRejectedValue(new Error("stripe down"));
    const result = await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });
});

describe("selfHealBuyingGuideVdiPurchase", () => {
  it("returns the purchase unchanged when it isn't pending", async () => {
    mocks.getVdiPurchase.mockResolvedValue(purchase({ status: "paid" }));
    const result = await selfHealBuyingGuideVdiPurchase("purchase123", "cs_1");
    expect(result?.status).toBe("paid");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });

  it("returns the pending purchase unchanged when the Stripe session isn't paid", async () => {
    mocks.getVdiPurchase.mockResolvedValue(purchase({ status: "pending" }));
    mocks.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "unpaid", metadata: { purchaseId: "purchase123" } });
    const result = await selfHealBuyingGuideVdiPurchase("purchase123", "cs_1");
    expect(result?.status).toBe("pending");
    expect(mocks.markVdiPurchasePaid).not.toHaveBeenCalled();
  });

  it("returns the pending purchase unchanged when the session's metadata doesn't match", async () => {
    mocks.getVdiPurchase.mockResolvedValue(purchase({ status: "pending" }));
    mocks.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "paid", metadata: { purchaseId: "different" } });
    const result = await selfHealBuyingGuideVdiPurchase("purchase123", "cs_1");
    expect(result?.status).toBe("pending");
    expect(mocks.markVdiPurchasePaid).not.toHaveBeenCalled();
  });

  it("marks the purchase paid when the session genuinely is paid and matches", async () => {
    mocks.getVdiPurchase.mockResolvedValue(purchase({ status: "pending" }));
    mocks.retrieve.mockResolvedValue({ id: "cs_1", payment_status: "paid", metadata: { purchaseId: "purchase123" } });
    mocks.markVdiPurchasePaid.mockResolvedValue(purchase({ status: "paid" }));

    const result = await selfHealBuyingGuideVdiPurchase("purchase123", "cs_1");

    expect(mocks.markVdiPurchasePaid).toHaveBeenCalledWith("purchase123", "cs_1");
    expect(result?.status).toBe("paid");
  });

  it("fails soft, returning the purchase as-is, when Stripe itself throws", async () => {
    mocks.getVdiPurchase.mockResolvedValue(purchase({ status: "pending" }));
    mocks.retrieve.mockRejectedValue(new Error("stripe down"));
    const result = await selfHealBuyingGuideVdiPurchase("purchase123", "cs_1");
    expect(result?.status).toBe("pending");
  });
});

describe("applyBuyingGuideVdiPurchaseFromWebhookSession", () => {
  it("does nothing when the purchase doesn't exist", async () => {
    mocks.getVdiPurchase.mockResolvedValue(null);
    await applyBuyingGuideVdiPurchaseFromWebhookSession("missing", { id: "cs_1" });
    expect(mocks.markVdiPurchasePaid).not.toHaveBeenCalled();
  });

  it("marks the purchase paid when it exists", async () => {
    mocks.getVdiPurchase.mockResolvedValue(purchase());
    await applyBuyingGuideVdiPurchaseFromWebhookSession("purchase123", { id: "cs_1" });
    expect(mocks.markVdiPurchasePaid).toHaveBeenCalledWith("purchase123", "cs_1");
  });
});
