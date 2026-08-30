import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getShareLink: vi.fn(),
  updateShareLinkAskingPrice: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/shareLink", () => ({
  getShareLink: mocks.getShareLink,
  updateShareLinkAskingPrice: mocks.updateShareLinkAskingPrice,
}));

import { POST } from "@/app/api/tracker/share-link/[token]/asking-price/route";

function req(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/share-link/tok/asking-price", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tracker/share-link/[token]/asking-price", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getShareLink.mockResolvedValue({ id: "tok-1", email: "owner@example.com" });
    mocks.updateShareLinkAskingPrice.mockResolvedValue({ askingPrice: 4500 });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(req("{}"), { params: { token: "tok-1" } });
    expect(response.status).toBe(401);
  });

  it("returns not found for a link belonging to someone else, the identical response as nonexistent", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    const response = await POST(req(JSON.stringify({ askingPrice: 4500 })), { params: { token: "tok-1" } });
    expect(response.status).toBe(404);
  });

  // Ownership is checked here BEFORE the body is even parsed - unlike
  // extend and send-email, which validate the body first. Malformed
  // JSON on someone else's token still comes back as the same 404, not
  // a 400, since the request never gets that far.
  it("checks ownership before ever reading the body, so malformed JSON on someone else's link still returns 404", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    const response = await POST(req("not-json"), { params: { token: "tok-1" } });
    expect(response.status).toBe(404);
  });

  it("rejects malformed JSON on a genuinely owned link", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req("not-json"), { params: { token: "tok-1" } });
    expect(response.status).toBe(400);
  });

  it("rejects a non-positive or non-finite asking price", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    expect((await POST(req(JSON.stringify({ askingPrice: -50 })), { params: { token: "tok-1" } })).status).toBe(400);
    expect((await POST(req(JSON.stringify({ askingPrice: 0 })), { params: { token: "tok-1" } })).status).toBe(400);
    expect((await POST(req(JSON.stringify({ askingPrice: "5000" })), { params: { token: "tok-1" } })).status).toBe(400);
  });

  it("rejects an asking price above the sanity ceiling, accepts one exactly at it", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    expect((await POST(req(JSON.stringify({ askingPrice: 200001 })), { params: { token: "tok-1" } })).status).toBe(400);
    expect((await POST(req(JSON.stringify({ askingPrice: 200000 })), { params: { token: "tok-1" } })).status).toBe(200);
  });

  // Deliberately not an error case - clearing a previously-set price is
  // just as valid an action as setting one.
  it("treats an explicit null the same as an omitted field: clears the price rather than rejecting it", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(req(JSON.stringify({ askingPrice: null })), { params: { token: "tok-1" } });
    expect(mocks.updateShareLinkAskingPrice).toHaveBeenCalledWith("tok-1", null);

    mocks.updateShareLinkAskingPrice.mockClear();
    await POST(req(JSON.stringify({})), { params: { token: "tok-1" } });
    expect(mocks.updateShareLinkAskingPrice).toHaveBeenCalledWith("tok-1", null);
  });

  it("updates a valid asking price", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req(JSON.stringify({ askingPrice: 4500 })), { params: { token: "tok-1" } });
    expect(mocks.updateShareLinkAskingPrice).toHaveBeenCalledWith("tok-1", 4500);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ askingPrice: 4500 });
  });

  it("returns not found if the link vanishes between the ownership check and the update itself", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateShareLinkAskingPrice.mockResolvedValue(null);
    const response = await POST(req(JSON.stringify({ askingPrice: 4500 })), { params: { token: "tok-1" } });
    expect(response.status).toBe(404);
  });
});