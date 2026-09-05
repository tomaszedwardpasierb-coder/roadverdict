import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBike: vi.fn(),
  getPrimaryBike: vi.fn(),
  updateBikeMileage: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateMod: vi.fn(),
  deleteMod: vi.fn(),
  getMods: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
  getTrackerDocById: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getPrimaryBike: mocks.getPrimaryBike,
  updateBikeMileage: mocks.updateBikeMileage,
  isBikeReadOnly: mocks.isBikeReadOnly,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/mod", () => ({ updateMod: mocks.updateMod, deleteMod: mocks.deleteMod, getMods: mocks.getMods }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ getTrackerDocById: mocks.getTrackerDocById }));

import { PATCH, DELETE } from "@/app/api/tracker/mods/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/mods/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::mod::abc123";
const validPayload = { category: "exhaust", name: "Akrapovic can", cost: 400, mileage: 5200, date: "2025-06-01" };

describe("PATCH /api/tracker/mods/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: undefined });
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.updateMod.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateMod", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: "attacker@example.com::mod::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.updateMod).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(403);
    expect(mocks.updateMod).not.toHaveBeenCalled();
  });

  it.each(["estimated", "interpolated"])("promotes a %s mileage confidence to confirmed on edit", async (confidence) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: confidence });

    await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });

    expect(mocks.updateMod).toHaveBeenCalledWith("owner@example.com", ownId, expect.objectContaining({ mileageConfidence: "confirmed" }));
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
    expect(mocks.updateMod).not.toHaveBeenCalled();
  });

  it("bumps the bike's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(request(JSON.stringify({ ...validPayload, mileage: 5200 })), { params: Promise.resolve({ id: ownId }) });
    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 5200);
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateMod.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/tracker/mods/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: "attacker@example.com::mod::x" }) });
    expect(response.status).toBe(404);
    expect(mocks.deleteMod).not.toHaveBeenCalled();
  });

  it("checks read-only status against the record's own bike, looked up via its stored bikeId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(mocks.getBike).toHaveBeenCalledWith("owner@example.com", "bike-1");
    expect(response.status).toBe(403);
  });

  it("deletes a valid, owned mod", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: Promise.resolve({ id: ownId }) });
    expect(response.status).toBe(200);
    expect(mocks.deleteMod).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});