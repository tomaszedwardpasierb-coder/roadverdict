import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  retrieve: vi.fn(),
  createVdiPurchase: vi.fn(),
  createFreeProVdiPurchase: vi.fn(),
  getVdiPurchase: vi.fn(),
  markVdiPurchasePaid: vi.fn(),
  computeBuyingGuideReportTier: vi.fn(),
  getUserDoc: vi.fn(),
  canRunFreeVehicleHistoryReport: vi.fn(),
  recordVehicleHistoryReportRun: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: mocks.create, retrieve: mocks.retrieve } } }),
}));
vi.mock("@/lib/tracker/vdiPurchase", () => ({
  createVdiPurchase: mocks.createVdiPurchase,
  createFreeProVdiPurchase: mocks.createFreeProVdiPurchase,
  getVdiPurchase: mocks.getVdiPurchase,
  markVdiPurchasePaid: mocks.markVdiPurchasePaid,
}));
vi.mock("@/lib/payments/buyingGuideReportTier", () => ({ computeBuyingGuideReportTier: mocks.computeBuyingGuideReportTier }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/vehicleHistoryReportUsage", () => ({
  canRunFreeVehicleHistoryReport: mocks.canRunFreeVehicleHistoryReport,
  recordVehicleHistoryReportRun: mocks.recordVehicleHistoryReportRun,
}));

import {
  createBuyingGuideVdiCheckoutSession,
  selfHealBuyingGuideVdiPurchase,
  applyBuyingGuideVdiPurchaseFromWebhookSession,
} from "@/lib/payments/buyingGuideVdiCheckout";

function purchase(overrides: Partial<{ id: string; status: string; pricePence: number }> = {}) {
  return {
    id: overrides.id ?? "purchase123",
    pk: overrides.id ?? "purchase123",
    type: "vdiPurchase" as const,
    email: "buyer@example.com",
    vrm: "AB12CDE",
    vehicleKind: "bike" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    status: overrides.status ?? "pending",
    pricePence: overrides.pricePence,
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  // Default: a plain free-tier, no-vehicle account - the "everyone pays
  // the freeNoVehicle price" baseline most tests don't care about tiering.
  mocks.computeBuyingGuideReportTier.mockResolvedValue({
    tier: "freeNoVehicle",
    pricePence: 1499,
    proFreeAvailable: false,
    nextFreeAt: null,
  });
});

describe("createBuyingGuideVdiCheckoutSession", () => {
  it("creates the purchase doc with the computed tier/price, then a checkout session carrying its id as metadata", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 1499 }));
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    const result = await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");

    expect(mocks.createVdiPurchase).toHaveBeenCalledWith("buyer@example.com", "AB12CDE", "bike", "freeNoVehicle", 1499);
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session123" });
    const args = mocks.create.mock.calls[0][0];
    expect(args.mode).toBe("payment");
    expect(args.client_reference_id).toBe("purchase123");
    expect(args.metadata).toEqual({ purchaseId: "purchase123", vehicleKind: "bike" });
    expect(args.line_items[0].price_data.unit_amount).toBe(1499);
    expect(args.line_items[0].price_data.currency).toBe("gbp");
    expect(args.success_url).toBe(
      "https://roadverdict.co.uk/buying-guide?vdiPurchaseId=purchase123&vrm=AB12CDE&session_id={CHECKOUT_SESSION_ID}"
    );
    expect(args.cancel_url).toBe("https://roadverdict.co.uk/buying-guide");
  });

  it("charges the freeWithVehicle price for a free account with a registered vehicle", async () => {
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "freeWithVehicle",
      pricePence: 1299,
      proFreeAvailable: false,
      nextFreeAt: null,
    });
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 1299 }));
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");

    expect(mocks.createVdiPurchase).toHaveBeenCalledWith("buyer@example.com", "AB12CDE", "bike", "freeWithVehicle", 1299);
    expect(mocks.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(1299);
  });

  it("charges the pro price when a Pro account is off its free allowance", async () => {
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "pro",
      pricePence: 999,
      proFreeAvailable: false,
      nextFreeAt: "2026-02-01T00:00:00.000Z",
    });
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 999 }));
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");

    expect(mocks.createVdiPurchase).toHaveBeenCalledWith("buyer@example.com", "AB12CDE", "bike", "pro", 999);
    expect(mocks.create.mock.calls[0][0].line_items[0].price_data.unit_amount).toBe(999);
    expect(mocks.createFreeProVdiPurchase).not.toHaveBeenCalled();
  });

  it("grants a free report with no Stripe session when a Pro account still has its free allowance", async () => {
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "pro",
      pricePence: 0,
      proFreeAvailable: true,
      nextFreeAt: null,
    });
    mocks.getUserDoc.mockResolvedValue({ id: "pro@example.com", pk: "pro@example.com", type: "user", email: "pro@example.com", createdAt: "x" });
    mocks.canRunFreeVehicleHistoryReport.mockReturnValue(true);
    mocks.createFreeProVdiPurchase.mockResolvedValue(purchase({ id: "free-purchase-1", status: "paid", pricePence: 0 }));

    const result = await createBuyingGuideVdiCheckoutSession("pro@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");

    expect(mocks.recordVehicleHistoryReportRun).toHaveBeenCalledWith("pro@example.com");
    expect(mocks.createFreeProVdiPurchase).toHaveBeenCalledWith("pro@example.com", "AB12CDE", "bike", "pro");
    expect(result).toEqual({ ok: true, freeReportReady: true, purchaseId: "free-purchase-1" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.createVdiPurchase).not.toHaveBeenCalled();
  });

  it("falls through to the paid pro price when the free-allowance re-check loses the race", async () => {
    mocks.computeBuyingGuideReportTier.mockResolvedValue({
      tier: "pro",
      pricePence: 0,
      proFreeAvailable: true,
      nextFreeAt: null,
    });
    mocks.getUserDoc.mockResolvedValue({ id: "pro@example.com", pk: "pro@example.com", type: "user", email: "pro@example.com", createdAt: "x" });
    // Someone else's request already claimed the allowance between the
    // read in computeBuyingGuideReportTier and this re-check.
    mocks.canRunFreeVehicleHistoryReport.mockReturnValue(false);
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 999 }));
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session123" });

    const result = await createBuyingGuideVdiCheckoutSession("pro@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");

    expect(mocks.createFreeProVdiPurchase).not.toHaveBeenCalled();
    expect(mocks.recordVehicleHistoryReportRun).not.toHaveBeenCalled();
    expect(mocks.createVdiPurchase).toHaveBeenCalledWith("pro@example.com", "AB12CDE", "bike", "pro", 999);
    expect(result).toEqual({ ok: true, url: "https://checkout.stripe.com/session123" });
  });

  it("points a car purchase at the car buying-guide path", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 1499 }));
    mocks.create.mockResolvedValue({ url: "https://checkout.stripe.com/session456" });

    await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "car", "https://roadverdict.co.uk");

    const args = mocks.create.mock.calls[0][0];
    expect(args.success_url).toContain("https://roadverdict.co.uk/cars/buying-guide?");
    expect(args.cancel_url).toBe("https://roadverdict.co.uk/cars/buying-guide");
  });

  it("returns creation_failed when Stripe returns no session url", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 1499 }));
    mocks.create.mockResolvedValue({ url: null });
    const result = await createBuyingGuideVdiCheckoutSession("buyer@example.com", "AB12CDE", "bike", "https://roadverdict.co.uk");
    expect(result).toEqual({ ok: false, reason: "creation_failed" });
  });

  it("returns creation_failed when Stripe itself throws", async () => {
    mocks.createVdiPurchase.mockResolvedValue(purchase({ pricePence: 1499 }));
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
