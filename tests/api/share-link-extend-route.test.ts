import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getShareLink: vi.fn(),
  extendShareLink: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/shareLink", () => ({ getShareLink: mocks.getShareLink, extendShareLink: mocks.extendShareLink }));

import { POST } from "@/app/api/tracker/share-link/[token]/extend/route";

function req(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/share-link/tok/extend", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tracker/share-link/[token]/extend", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getShareLink.mockResolvedValue({ id: "tok-1", email: "owner@example.com" });
    mocks.extendShareLink.mockResolvedValue({ id: "tok-1", expiresAt: "2026-01-01" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(req("{}"), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req("not-json"), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(400);
  });

  it("rejects a missing or invalid duration", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req(JSON.stringify({ duration: "1year" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(400);
  });

  // The opposite order from asking-price: here the body is validated
  // BEFORE ownership is checked, so an invalid duration on someone
  // else's token still returns 400, not 404 - worth confirming this is
  // genuinely what happens, not assumed to match the sibling route.
  it("validates the duration before checking ownership, so an invalid duration on someone else's link still returns 400", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });

    const response = await POST(req(JSON.stringify({ duration: "1year" })), { params: Promise.resolve({ token: "tok-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.getShareLink).not.toHaveBeenCalled();
  });

  it("returns not found for a valid duration on a link belonging to someone else", async () => {
    mocks.getSession.mockResolvedValue({ email: "attacker@example.com" });
    const response = await POST(req(JSON.stringify({ duration: "1month" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(response.status).toBe(404);
    expect(mocks.extendShareLink).not.toHaveBeenCalled();
  });

  it("extends a valid, owned link", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(req(JSON.stringify({ duration: "1month" })), { params: Promise.resolve({ token: "tok-1" }) });
    expect(mocks.extendShareLink).toHaveBeenCalledWith("tok-1", "1month");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ link: { id: "tok-1", expiresAt: "2026-01-01" } });
  });
});