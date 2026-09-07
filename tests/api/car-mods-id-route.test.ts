import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCarById: vi.fn(),
  getPrimaryCar: vi.fn(),
  updateCarMileage: vi.fn(),
  isCarReadOnly: vi.fn(),
  updateCarMod: vi.fn(),
  deleteCarMod: vi.fn(),
  getCarMods: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarFuelLogs: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
  getTrackerDocById: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getPrimaryCar: mocks.getPrimaryCar,
  updateCarMileage: mocks.updateCarMileage,
  isCarReadOnly: mocks.isCarReadOnly,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carMod", () => ({ updateCarMod: mocks.updateCarMod, deleteCarMod: mocks.deleteCarMod, getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ getTrackerDocById: mocks.getTrackerDocById }));

import { PATCH, DELETE } from "@/app/api/cars/car-mods/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-mods/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::carMod::abc123";
const validPayload = { category: "dash-cam", name: "Front dash cam", cost: 80, mileage: 42000, date: "2025-06-01" };

describe("PATCH /api/cars/car-mods/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.getTrackerDocById.mockResolvedValue({ carId: "car-1", mileageConfidence: undefined });
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarFuelLogs.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.updateCarMod.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateCarMod", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: "attacker@example.com::carMod::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateCarMod).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateCarMod).not.toHaveBeenCalled();
  });

  it.each(["estimated", "interpolated"])("promotes a %s mileage confidence to confirmed on edit", async (confidence) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getTrackerDocById.mockResolvedValue({ carId: "car-1", mileageConfidence: confidence });

    await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });

    expect(mocks.updateCarMod).toHaveBeenCalledWith("owner@example.com", ownId, expect.objectContaining({ mileageConfidence: "confirmed" }));
  });

  it("excludes the record's own id from the mileage-consistency check", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(mocks.checkMileageConsistency.mock.calls[0][4]).toBe(ownId);
  });

  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked" });
    const response = await PATCH(
      request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })), { params: Promise.resolve({ id: ownId }) }
    );
    expect(response.status).toBe(409);
    expect(mocks.updateCarMod).not.toHaveBeenCalled();
  });

  it("bumps the car's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(request(JSON.stringify({ ...validPayload, mileage: 42000 })), { params: Promise.resolve({ id: ownId }) });
    expect(mocks.updateCarMileage).toHaveBeenCalledWith("owner@example.com", "car-1", 42000);
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateCarMod.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/cars/car-mods/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTrackerDocById.mockResolvedValue({ carId: "car-1" });
    mocks.getCarById.mockResolvedValue({ id: "car-1" });
    mocks.isCarReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::carMod::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteCarMod).not.toHaveBeenCalled();
  });

  it("checks read-only status against the record's own car, looked up via its stored carId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(mocks.getCarById).toHaveBeenCalledWith("owner@example.com", "car-1");
    expect(response.status).toBe(403);
  });

  it("deletes a valid, owned car mod", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteCarMod).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});
