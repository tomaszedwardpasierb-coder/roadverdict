import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), createBillingPortalSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/payments/proSubscription", () => ({
  createBillingPortalSession: mocks.createBillingPortalSession,
}));

import { POST } from "@/app/api/pro/billing-portal/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/pro/billing-portal", { method: "POST" });
}

beforeEach(() => {
  mocks.getSession.mockReset();
  mocks.createBillingPortalSession.mockReset();
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("POST /api/pro/billing-portal", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.createBillingPortalSession).not.toHaveBeenCalled();
  });

  it("passes the signed-in email through", async () => {
    mocks.createBillingPortalSession.mockResolvedValue({ ok: true, url: "https://billing.stripe.com/x" });
    await POST(request());
    expect(mocks.createBillingPortalSession).toHaveBeenCalledWith("rider@example.com", expect.any(String));
  });

  it("returns the portal URL on success", async () => {
    mocks.createBillingPortalSession.mockResolvedValue({ ok: true, url: "https://billing.stripe.com/x" });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://billing.stripe.com/x" });
  });

  it("returns 404 when the account has no Stripe Customer to manage", async () => {
    mocks.createBillingPortalSession.mockResolvedValue({ ok: false });
    const response = await POST(request());
    expect(response.status).toBe(404);
  });
});
