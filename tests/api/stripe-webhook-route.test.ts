import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  applyVdiUnlockFromWebhookSession: vi.fn(),
  applyBuyingGuideVdiPurchaseFromWebhookSession: vi.fn(),
  applyProSubscriptionFromCheckoutSession: vi.fn(),
  applyProSubscriptionRenewed: vi.fn(),
  applyProSubscriptionCancelled: vi.fn(),
}));

vi.mock("@/lib/payments/stripe", () => ({
  getStripe: () => ({ webhooks: { constructEvent: mocks.constructEvent } }),
}));
vi.mock("@/lib/payments/vdiCheckout", () => ({
  applyVdiUnlockFromWebhookSession: mocks.applyVdiUnlockFromWebhookSession,
}));
vi.mock("@/lib/payments/buyingGuideVdiCheckout", () => ({
  applyBuyingGuideVdiPurchaseFromWebhookSession: mocks.applyBuyingGuideVdiPurchaseFromWebhookSession,
}));
vi.mock("@/lib/payments/proSubscription", () => ({
  applyProSubscriptionFromCheckoutSession: mocks.applyProSubscriptionFromCheckoutSession,
  applyProSubscriptionRenewed: mocks.applyProSubscriptionRenewed,
  applyProSubscriptionCancelled: mocks.applyProSubscriptionCancelled,
}));

import { POST } from "@/app/api/stripe/webhook/route";

function request(body: string, signature?: string): NextRequest {
  const headers = new Headers();
  if (signature !== undefined) headers.set("stripe-signature", signature);
  return new NextRequest("http://localhost/api/stripe/webhook", { method: "POST", body, headers });
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
});

describe("POST /api/stripe/webhook", () => {
  it("returns 500 when STRIPE_WEBHOOK_SECRET isn't configured", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const response = await POST(request("{}", "sig_abc"));
    expect(response.status).toBe(500);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when the stripe-signature header is missing", async () => {
    const response = await POST(request("{}"));
    expect(response.status).toBe(500);
    expect(mocks.constructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification fails", async () => {
    mocks.constructEvent.mockImplementation(() => {
      throw new Error("signature mismatch");
    });
    const response = await POST(request("{}", "sig_bad"));
    expect(response.status).toBe(400);
    expect(mocks.applyVdiUnlockFromWebhookSession).not.toHaveBeenCalled();
  });

  it("verifies against the raw request body, not a re-serialized/parsed one", async () => {
    const rawBody = '{"some":"raw body exactly as sent"}';
    mocks.constructEvent.mockReturnValue({ type: "some.other.event", data: { object: {} } });
    await POST(request(rawBody, "sig_ok"));
    expect(mocks.constructEvent).toHaveBeenCalledWith(rawBody, "sig_ok", "whsec_test");
  });

  it("ignores event types other than checkout.session.completed", async () => {
    mocks.constructEvent.mockReturnValue({ type: "payment_intent.succeeded", data: { object: {} } });
    const response = await POST(request("{}", "sig_ok"));
    expect(response.status).toBe(200);
    expect(mocks.applyVdiUnlockFromWebhookSession).not.toHaveBeenCalled();
  });

  it("applies the unlock on a completed, paid checkout session with valid metadata", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_1",
          payment_status: "paid",
          amount_total: 799,
          currency: "gbp",
          metadata: { token: "tok_abc", vehicleKind: "bike" },
        },
      },
    });
    const response = await POST(request("{}", "sig_ok"));
    expect(response.status).toBe(200);
    expect(mocks.applyVdiUnlockFromWebhookSession).toHaveBeenCalledWith("tok_abc", "bike", {
      id: "cs_1",
      amount_total: 799,
      currency: "gbp",
    });
  });

  it("does not apply the unlock when the session isn't actually paid", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", payment_status: "unpaid", metadata: { token: "tok_abc", vehicleKind: "bike" } } },
    });
    await POST(request("{}", "sig_ok"));
    expect(mocks.applyVdiUnlockFromWebhookSession).not.toHaveBeenCalled();
  });

  it("does not apply the unlock when metadata is missing an expected field", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", payment_status: "paid", metadata: {} } },
    });
    await POST(request("{}", "sig_ok"));
    expect(mocks.applyVdiUnlockFromWebhookSession).not.toHaveBeenCalled();
  });

  it("routes a car session to vehicleKind 'car'", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_2",
          payment_status: "paid",
          amount_total: 1399,
          currency: "gbp",
          metadata: { token: "tok_xyz", vehicleKind: "car" },
        },
      },
    });
    await POST(request("{}", "sig_ok"));
    expect(mocks.applyVdiUnlockFromWebhookSession).toHaveBeenCalledWith("tok_xyz", "car", {
      id: "cs_2",
      amount_total: 1399,
      currency: "gbp",
    });
  });

  // ── Buying Guide's standalone purchase (metadata.purchaseId, not metadata.token) ──

  it("applies the Buying Guide purchase instead of a report unlock when metadata carries purchaseId, not token", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_3",
          payment_status: "paid",
          metadata: { purchaseId: "purchase123", vehicleKind: "bike" },
        },
      },
    });
    const response = await POST(request("{}", "sig_ok"));
    expect(response.status).toBe(200);
    expect(mocks.applyBuyingGuideVdiPurchaseFromWebhookSession).toHaveBeenCalledWith("purchase123", { id: "cs_3" });
    expect(mocks.applyVdiUnlockFromWebhookSession).not.toHaveBeenCalled();
  });

  it("does not apply the Buying Guide purchase when the session isn't actually paid", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_3", payment_status: "unpaid", metadata: { purchaseId: "purchase123", vehicleKind: "bike" } } },
    });
    await POST(request("{}", "sig_ok"));
    expect(mocks.applyBuyingGuideVdiPurchaseFromWebhookSession).not.toHaveBeenCalled();
  });

  it("prefers the report-unlock path when metadata somehow carries both token and purchaseId", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_4",
          payment_status: "paid",
          metadata: { token: "tok_abc", purchaseId: "purchase123", vehicleKind: "bike" },
        },
      },
    });
    await POST(request("{}", "sig_ok"));
    expect(mocks.applyVdiUnlockFromWebhookSession).toHaveBeenCalled();
    expect(mocks.applyBuyingGuideVdiPurchaseFromWebhookSession).not.toHaveBeenCalled();
  });

  // ── Pro subscription (metadata.kind === "pro_subscription", and the two subscription lifecycle events) ──

  it("routes a subscription checkout to applyProSubscriptionFromCheckoutSession, not the one-time purchase paths", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_5", payment_status: "paid", metadata: { email: "rider@example.com", kind: "pro_subscription" } } },
    });
    const response = await POST(request("{}", "sig_ok"));
    expect(response.status).toBe(200);
    expect(mocks.applyProSubscriptionFromCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cs_5", metadata: { email: "rider@example.com", kind: "pro_subscription" } })
    );
    expect(mocks.applyVdiUnlockFromWebhookSession).not.toHaveBeenCalled();
    expect(mocks.applyBuyingGuideVdiPurchaseFromWebhookSession).not.toHaveBeenCalled();
  });

  it("does not require payment_status to be checked for a subscription checkout - that's applyProSubscriptionFromCheckoutSession's own job", async () => {
    // Unlike the one-time purchases above, a subscription session's
    // completion is meaningful regardless of payment_status - the
    // subscription's own active/trialing status is what actually
    // gates the plan grant, inside proSubscription.ts itself.
    mocks.constructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { id: "cs_6", payment_status: "no_payment_required", metadata: { email: "rider@example.com", kind: "pro_subscription" } } },
    });
    await POST(request("{}", "sig_ok"));
    expect(mocks.applyProSubscriptionFromCheckoutSession).toHaveBeenCalled();
  });

  it("routes customer.subscription.updated to applyProSubscriptionRenewed", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1", status: "active", metadata: { email: "rider@example.com" } } },
    });
    const response = await POST(request("{}", "sig_ok"));
    expect(response.status).toBe(200);
    expect(mocks.applyProSubscriptionRenewed).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_1", status: "active" })
    );
  });

  it("routes customer.subscription.deleted to applyProSubscriptionCancelled", async () => {
    mocks.constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: { id: "sub_1", status: "canceled", metadata: { email: "rider@example.com" } } },
    });
    const response = await POST(request("{}", "sig_ok"));
    expect(response.status).toBe(200);
    expect(mocks.applyProSubscriptionCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sub_1", status: "canceled" })
    );
  });
});
