import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  updateBikeMileage: vi.fn(),
  isBikeReadOnly: vi.fn(),
  createMod: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  checkMileageConsistency: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  updateBikeMileage: mocks.updateBikeMileage,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/mod", () => ({ createMod: mocks.createMod, getMods: mocks.getMods }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: vi.fn(() => "Mileage conflict"),
}));

import { POST } from "@/app/api/tracker/mods/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/mods", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tracker/mods", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request("not-json"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
  });

  it("rejects malformed JSON for an authenticated request", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request("not-json"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid request body." });
  });

  it("rejects incomplete payloads before accessing the vehicle repository", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ category: "accessories" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 1000 });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify({
      category: "accessories",
      name: "Top box",
      cost: 250,
      mileage: 1000,
      date: "2025-01-01",
    })));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This bike has been transferred and is now read-only.",
    });
    expect(mocks.createMod).not.toHaveBeenCalled();
  });

  it("creates a valid mod for the authenticated owner's active bike", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 1000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.createMod.mockResolvedValue({ id: "mod-1" });

    const response = await POST(request(JSON.stringify({
      category: "accessories",
      name: "Top box",
      cost: 250,
      mileage: 1200,
      date: "2025-01-01",
      notes: "Fitted by owner",
    })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mod: { id: "mod-1" } });
    expect(mocks.createMod).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      name: "Top box",
      mileage: 1200,
    }));
    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 1200);
  });

  it("returns a conflict when the server-side mileage check rejects the entry", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 1000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.checkMileageConsistency.mockReturnValue({ status: "warning", reason: "below-earlier" });

    const response = await POST(request(JSON.stringify({
      category: "accessories",
      name: "Top box",
      cost: 250,
      mileage: 900,
      date: "2025-01-01",
    })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Mileage conflict" });
    expect(mocks.createMod).not.toHaveBeenCalled();
  });
});