import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findBikeByRegistrationAcrossAccounts: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  findBikeByRegistrationAcrossAccounts: mocks.findBikeByRegistrationAcrossAccounts,
}));

import { GET } from "@/app/api/tracker/bike-exists/route";

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/tracker/bike-exists${query}`, { method: "GET" });
}

describe("GET /api/tracker/bike-exists", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("?registration=AB12CDE"));
    expect(response.status).toBe(401);
    expect(mocks.findBikeByRegistrationAcrossAccounts).not.toHaveBeenCalled();
  });

  it("requires a registration query param", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await GET(request(""));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Registration number is required." });
  });

  it("reports exists:false when no bike anywhere carries that plate", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.findBikeByRegistrationAcrossAccounts.mockResolvedValue(null);

    const response = await GET(request("?registration=AB12CDE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ exists: false });
  });

  it("reveals the bikeId when the match belongs to the signed-in user", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.findBikeByRegistrationAcrossAccounts.mockResolvedValue({ ownerEmail: "owner@example.com", bikeId: "bike-1" });

    const response = await GET(request("?registration=AB12CDE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      exists: true,
      belongsToCurrentUser: true,
      bikeId: "bike-1",
    });
  });

  // The privacy guarantee stated in the source comment: never reveal a
  // stranger's bikeId, only that a registration exists and isn't theirs.
  it("withholds the bikeId when the match belongs to a different account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.findBikeByRegistrationAcrossAccounts.mockResolvedValue({ ownerEmail: "stranger@example.com", bikeId: "bike-99" });

    const response = await GET(request("?registration=AB12CDE"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ exists: true, belongsToCurrentUser: false, bikeId: undefined });
    expect(body.bikeId).toBeUndefined();
  });
});