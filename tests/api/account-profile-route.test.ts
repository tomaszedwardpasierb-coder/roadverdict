import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ updateProfile: mocks.updateProfile }));

import { PATCH } from "@/app/api/account/profile/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/account/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("PATCH /api/account/profile", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify({ displayName: "Alex" })));
    expect(response.status).toBe(401);
  });

  it("rejects malformed JSON", async () => {
    const response = await PATCH(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("trims and saves a valid display name", async () => {
    const response = await PATCH(request(JSON.stringify({ displayName: "  Alex  " })));
    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith("rider@example.com", { displayName: "Alex" });
    await expect(response.json()).resolves.toEqual({ displayName: "Alex" });
  });

  it("rejects a name that's only whitespace", async () => {
    const response = await PATCH(request(JSON.stringify({ displayName: "   " })));
    expect(response.status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("rejects a name over 60 characters", async () => {
    const response = await PATCH(request(JSON.stringify({ displayName: "a".repeat(61) })));
    expect(response.status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });

  it("clears the name when displayName is explicitly null", async () => {
    const response = await PATCH(request(JSON.stringify({ displayName: null })));
    expect(response.status).toBe(200);
    expect(mocks.updateProfile).toHaveBeenCalledWith("rider@example.com", { displayName: null });
  });

  it("rejects a request with nothing to update", async () => {
    const response = await PATCH(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(mocks.updateProfile).not.toHaveBeenCalled();
  });
});
