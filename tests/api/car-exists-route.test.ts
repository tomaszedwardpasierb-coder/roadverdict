import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  findCarByRegistrationAcrossAccounts: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  findCarByRegistrationAcrossAccounts: mocks.findCarByRegistrationAcrossAccounts,
}));

import { GET } from "@/app/api/cars/car-exists/route";

function request(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/cars/car-exists${query}`, { method: "GET" });
}

describe("GET /api/cars/car-exists", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET(request("?registration=AB12CDE"));
    expect(response.status).toBe(401);
    expect(mocks.findCarByRegistrationAcrossAccounts).not.toHaveBeenCalled();
  });

  it("requires a registration query param", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await GET(request(""));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Registration number is required." });
  });

  it("reports exists:false when no car anywhere carries that plate", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.findCarByRegistrationAcrossAccounts.mockResolvedValue(null);

    const response = await GET(request("?registration=AB12CDE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ exists: false });
  });

  it("reveals the carId when the match belongs to the signed-in user", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.findCarByRegistrationAcrossAccounts.mockResolvedValue({ ownerEmail: "owner@example.com", carId: "car-1" });

    const response = await GET(request("?registration=AB12CDE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      exists: true,
      belongsToCurrentUser: true,
      carId: "car-1",
    });
  });

  it("withholds the carId when the match belongs to a different account", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.findCarByRegistrationAcrossAccounts.mockResolvedValue({ ownerEmail: "stranger@example.com", carId: "car-99" });

    const response = await GET(request("?registration=AB12CDE"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ exists: true, belongsToCurrentUser: false, carId: undefined });
    expect(body.carId).toBeUndefined();
  });
});
