import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  updateCarMileage: vi.fn(),
  isCarReadOnly: vi.fn(),
  createCarMod: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarMods: vi.fn(),
  checkMileageConsistency: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  updateCarMileage: mocks.updateCarMileage,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carMod", () => ({ createCarMod: mocks.createCarMod, getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: vi.fn(() => "Mileage conflict"),
}));

import { POST } from "@/app/api/cars/car-mods/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-mods", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/cars/car-mods", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarFuelLogs.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
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
    const response = await POST(request(JSON.stringify({ category: "dash-cam" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify({
      category: "dash-cam", name: "Front dash cam", cost: 80, mileage: 40000, date: "2025-01-01",
    })));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "This car has been transferred and is now read-only.",
    });
    expect(mocks.createCarMod).not.toHaveBeenCalled();
  });

  it("creates a valid mod for the authenticated owner's active car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.createCarMod.mockResolvedValue({ id: "mod-1" });

    const response = await POST(request(JSON.stringify({
      category: "dash-cam", name: "Front dash cam", cost: 80, mileage: 42000, date: "2025-01-01", notes: "Fitted by owner",
    })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ mod: { id: "mod-1" } });
    expect(mocks.createCarMod).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      carId: "car-1", name: "Front dash cam", mileage: 42000,
    }));
    expect(mocks.updateCarMileage).toHaveBeenCalledWith("owner@example.com", "car-1", 42000);
  });

  it("returns a conflict when the server-side mileage check rejects the entry", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.checkMileageConsistency.mockReturnValue({ status: "warning", reason: "below-earlier" });

    const response = await POST(request(JSON.stringify({
      category: "dash-cam", name: "Front dash cam", cost: 80, mileage: 39000, date: "2025-01-01",
    })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Mileage conflict" });
    expect(mocks.createCarMod).not.toHaveBeenCalled();
  });
});
