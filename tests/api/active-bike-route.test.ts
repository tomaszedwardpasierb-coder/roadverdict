import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBikesForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  ACTIVE_BIKE_COOKIE: "activeBikeId",
}));

import { POST } from "@/app/api/tracker/active-bike/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/active-bike", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tracker/active-bike", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getBikesForUser.mockResolvedValue([{ id: "bike-1" }, { id: "bike-2" }]);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("{}"));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("requires a bikeId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "bikeId is required." });
  });

  it("returns 404 when the bikeId doesn't belong to this account, without setting a cookie", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ bikeId: "someone-elses-bike" })));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Bike not found on this account." });
    expect(response.cookies.get("activeBikeId")).toBeUndefined();
  });

  // Explicit guarantee stated in the source comment: httpOnly, secure,
  // lax, root path, and a full year - a UI preference, not a
  // short-lived auth token.
  it("sets the active-bike cookie with the documented attributes on success", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ bikeId: "bike-2" })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    const cookie = response.cookies.get("activeBikeId");
    expect(cookie).toMatchObject({
      name: "activeBikeId",
      value: "bike-2",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  });
});