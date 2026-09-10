import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createVdiCheckoutSession: vi.fn() }));
vi.mock("@/lib/payments/vdiCheckout", () => ({ createVdiCheckoutSession: mocks.createVdiCheckoutSession }));

import { POST } from "@/app/api/tracker/vdi-checkout/route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/tracker/vdi-checkout", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.createVdiCheckoutSession.mockReset();
});

describe("POST /api/tracker/vdi-checkout", () => {
  it("returns 400 when the request body is invalid JSON", async () => {
    const req = new NextRequest("http://localhost/api/tracker/vdi-checkout", { method: "POST", body: "not json" });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("returns 400 when no token is given", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(mocks.createVdiCheckoutSession).not.toHaveBeenCalled();
  });

  it("calls createVdiCheckoutSession with vehicleKind 'bike'", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    await POST(request({ token: "tok_abc" }));
    expect(mocks.createVdiCheckoutSession).toHaveBeenCalledWith("tok_abc", "bike", expect.any(String));
  });

  it("returns the checkout URL on success", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    const response = await POST(request({ token: "tok_abc" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/x" });
  });

  it("returns 404 when the token isn't found", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "not_found" });
    const response = await POST(request({ token: "tok_missing" }));
    expect(response.status).toBe(404);
  });

  it("returns 409 when already unlocked", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "already_unlocked" });
    const response = await POST(request({ token: "tok_abc" }));
    expect(response.status).toBe(409);
  });

  it("returns 500 when Stripe session creation itself fails", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "creation_failed" });
    const response = await POST(request({ token: "tok_abc" }));
    expect(response.status).toBe(500);
  });
});
