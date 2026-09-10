// Car equivalent of vdi-checkout-route.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ createVdiCheckoutSession: vi.fn() }));
vi.mock("@/lib/payments/vdiCheckout", () => ({ createVdiCheckoutSession: mocks.createVdiCheckoutSession }));

import { POST } from "@/app/api/cars/vdi-checkout/route";

function request(body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/cars/vdi-checkout", {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.createVdiCheckoutSession.mockReset();
});

describe("POST /api/cars/vdi-checkout", () => {
  it("returns 400 when no token is given", async () => {
    const response = await POST(request({}));
    expect(response.status).toBe(400);
    expect(mocks.createVdiCheckoutSession).not.toHaveBeenCalled();
  });

  it("calls createVdiCheckoutSession with vehicleKind 'car'", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    await POST(request({ token: "tok_xyz" }));
    expect(mocks.createVdiCheckoutSession).toHaveBeenCalledWith("tok_xyz", "car", expect.any(String));
  });

  it("returns the checkout URL on success", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: true, url: "https://checkout.stripe.com/x" });
    const response = await POST(request({ token: "tok_xyz" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://checkout.stripe.com/x" });
  });

  it("returns 404/409/500 for not_found/already_unlocked/creation_failed respectively", async () => {
    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "not_found" });
    expect((await POST(request({ token: "t" }))).status).toBe(404);

    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "already_unlocked" });
    expect((await POST(request({ token: "t" }))).status).toBe(409);

    mocks.createVdiCheckoutSession.mockResolvedValue({ ok: false, reason: "creation_failed" });
    expect((await POST(request({ token: "t" }))).status).toBe(500);
  });
});
