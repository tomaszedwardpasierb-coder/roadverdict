import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createProCheckoutSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/payments/proSubscription", () => ({
  createProCheckoutSession: mocks.createProCheckoutSession,
}));

import { POST } from "@/app/api/pro/checkout/route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/pro/checkout", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.createProCheckoutSession.mockReset();
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("POST /api/pro/checkout", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request({ interval: "monthly" }));
    expect(response.status).toBe(401);
    expect(mocks.createProCheckoutSession).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/pro/checkout", { method: "POST", body: "not json" });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 for an interval that isn't 'monthly' or 'annual'", async () => {
    const response = await POST(request({ interval: "weekly" }));
    expect(response.status).toBe(400);
    expect(mocks.createProCheckoutSession).not.toHaveBeenCalled();
  });

  it("passes the signed-in email and interval through", async () => {
    mocks.createProCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    await POST(request({ interval: "annual" }));
    expect(mocks.createProCheckoutSession).toHaveBeenCalledWith("rider@example.com", "annual", expect.any(String));
  });

  it("returns the checkout URL on success", async () => {
    mocks.createProCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    const response = await POST(request({ interval: "monthly" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/x" });
  });

  it("returns 409 when the account already has Pro", async () => {
    mocks.createProCheckoutSession.mockResolvedValue({ ok: false, reason: "already_pro" });
    const response = await POST(request({ interval: "monthly" }));
    expect(response.status).toBe(409);
  });

  it("returns 500 when Stripe session creation itself fails", async () => {
    mocks.createProCheckoutSession.mockResolvedValue({ ok: false, reason: "creation_failed" });
    const response = await POST(request({ interval: "monthly" }));
    expect(response.status).toBe(500);
  });
});
