// Place at: tests/api/car-buying-guide-vdi-checkout-route.test.ts
// Car equivalent of buying-guide-vdi-checkout-route.test.ts - same
// mechanic, just "car" instead of "bike" as the vehicleKind.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createBuyingGuideVdiCheckoutSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/payments/buyingGuideVdiCheckout", () => ({
  createBuyingGuideVdiCheckoutSession: mocks.createBuyingGuideVdiCheckoutSession,
}));

import { POST } from "@/app/api/cars/buying-guide-vdi-checkout/route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/cars/buying-guide-vdi-checkout", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.createBuyingGuideVdiCheckoutSession.mockReset();
  mocks.getSession.mockResolvedValue({ email: "buyer@example.com" });
});

describe("POST /api/cars/buying-guide-vdi-checkout", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ vrm: "AB12CDE" }));
    expect(response.status).toBe(401);
    expect(mocks.createBuyingGuideVdiCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/cars/buying-guide-vdi-checkout", { method: "POST", body: "not json" });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 when no vrm is given", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(mocks.createBuyingGuideVdiCheckoutSession).not.toHaveBeenCalled();
  });

  it("normalises the vrm to uppercase with spaces stripped, and calls with vehicleKind 'car'", async () => {
    mocks.createBuyingGuideVdiCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    await POST(request({ vrm: "ab12 cde" }));
    expect(mocks.createBuyingGuideVdiCheckoutSession).toHaveBeenCalledWith("buyer@example.com", "AB12CDE", "car", expect.any(String));
  });

  it("returns the checkout URL on success", async () => {
    mocks.createBuyingGuideVdiCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    const response = await POST(request({ vrm: "AB12CDE" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/x" });
  });

  it("returns 500 when Stripe session creation itself fails", async () => {
    mocks.createBuyingGuideVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "creation_failed" });
    const response = await POST(request({ vrm: "AB12CDE" }));
    expect(response.status).toBe(500);
  });

  it("returns freeReportReady/vdiPurchaseId, not a checkout url, when a free Pro report was granted", async () => {
    mocks.createBuyingGuideVdiCheckoutSession.mockResolvedValue({ ok: true, freeReportReady: true, purchaseId: "free-purchase-1" });
    const response = await POST(request({ vrm: "AB12CDE" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ freeReportReady: true, vdiPurchaseId: "free-purchase-1" });
  });
});
