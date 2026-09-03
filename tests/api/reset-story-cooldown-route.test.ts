import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  getBikesForUser: vi.fn(),
  updateBikeStoryCache: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  updateBikeStoryCache: mocks.updateBikeStoryCache,
}));

import { POST } from "@/app/api/tomasz/reset-story-cooldown/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/reset-story-cooldown", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/reset-story-cooldown", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.updateBikeStoryCache.mockResolvedValue(null);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(401);
    expect(mocks.getBikesForUser).not.toHaveBeenCalled();
  });

  it("rejects a missing email", async () => {
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
  });

  it("returns 404 when the account has no bikes at all", async () => {
    mocks.getBikesForUser.mockResolvedValue([]);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com" })));
    expect(response.status).toBe(404);
    expect(mocks.updateBikeStoryCache).not.toHaveBeenCalled();
  });

  it("clears storyCache on every bike the account has, not just the primary one", async () => {
    mocks.getBikesForUser.mockResolvedValue([{ id: "bike-1" }, { id: "bike-2" }]);
    const response = await POST(request(JSON.stringify({ email: "  Rider@Example.com  " })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, bikesReset: 2 });
    expect(mocks.updateBikeStoryCache).toHaveBeenCalledWith("rider@example.com", "bike-1", undefined);
    expect(mocks.updateBikeStoryCache).toHaveBeenCalledWith("rider@example.com", "bike-2", undefined);
  });
});
