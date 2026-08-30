import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBike: vi.fn(),
  getPrimaryBike: vi.fn(),
  updateBikeMileage: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateFuelLog: vi.fn(),
  deleteFuelLog: vi.fn(),
  getFuelLogs: vi.fn(),
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
  checkFullTankPlausibility: vi.fn(),
  describeImplausibleFill: vi.fn(),
  checkLitresPlausibility: vi.fn(),
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
vi.mock("@/lib/tracker/fuelLog", () => ({ updateFuelLog: mocks.updateFuelLog, deleteFuelLog: mocks.deleteFuelLog, getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
vi.mock("@/lib/tracker/fuelPlausibility", () => ({
  checkFullTankPlausibility: mocks.checkFullTankPlausibility,
  describeImplausibleFill: mocks.describeImplausibleFill,
  checkLitresPlausibility: mocks.checkLitresPlausibility,
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ getTrackerDocById: mocks.getTrackerDocById }));

import { PATCH, DELETE } from "@/app/api/tracker/fuel/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/fuel/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::fuel::abc123";
const validPayload = { litres: 12, cost: 18, mileage: 5200, date: "2025-06-01" };

describe("PATCH /api/tracker/fuel/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 5000, tankCapacityLitres: 16 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: undefined });
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.checkLitresPlausibility.mockReturnValue({ implausible: false });
    mocks.updateFuelLog.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: { id: ownId } });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateFuelLog", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: "attacker@example.com::fuel::x" } });
    expect(response.status).toBe(404);
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });
    expect(response.status).toBe(403);
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  // The exact bug the source comment describes: an estimated/interpolated
  // mileage that a human is now editing directly is being reviewed right
  // now, so it should be promoted to confirmed rather than silently
  // surviving as "estimated" forever.
  it.each(["estimated", "interpolated"])("promotes a %s mileage confidence to confirmed on edit", async (confidence) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: confidence });

    await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });

    expect(mocks.updateFuelLog).toHaveBeenCalledWith("owner@example.com", ownId, expect.objectContaining({ mileageConfidence: "confirmed" }));
  });

  it("leaves an already-confirmed mileage confidence alone, and leaves an unset one unset", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: "confirmed" });

    await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });

    expect(mocks.updateFuelLog).toHaveBeenCalledWith("owner@example.com", ownId, expect.objectContaining({ mileageConfidence: "confirmed" }));
  });

  // A record being edited must not conflict against its own prior
  // stored value - the record's own id is passed through to the
  // consistency check specifically to exclude it from comparison.
  it("excludes the record's own id from the mileage-consistency check", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });

    const excludeIdArg = mocks.checkMileageConsistency.mock.calls[0][4];
    expect(excludeIdArg).toBe(ownId);
  });

  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked" });
    const response = await PATCH(
      request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })), { params: { id: ownId } }
    );
    expect(response.status).toBe(409);
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  it("rejects litres beyond what the tank could physically hold", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkLitresPlausibility.mockReturnValue({ implausible: true, reason: "Too much fuel for this tank." });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Too much fuel for this tank." });
  });

  // Excludes itself from the trusted-logs comparison the same way as the
  // mileage-consistency check above, for the same reason: editing a
  // full-tank fill must not compare it against its own previous value.
  it("excludes the record's own id from the full-tank trusted-logs comparison", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getFuelLogs.mockResolvedValue([
      { id: ownId, mileage: 5000 }, // the record being edited itself
      { id: "other", mileage: 4800 },
    ]);
    mocks.checkFullTankPlausibility.mockReturnValue({ plausible: true });

    await PATCH(request(JSON.stringify({ ...validPayload, filledToFull: true })), { params: { id: ownId } });

    const trustedLogs = mocks.checkFullTankPlausibility.mock.calls[0][2];
    expect(trustedLogs).toEqual([{ mileage: 4800 }]);
  });

  it("bumps the bike's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(request(JSON.stringify({ ...validPayload, mileage: 5200 })), { params: { id: ownId } });
    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 5200);
  });

  it("updates a valid fuel log", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });
    expect(response.status).toBe(200);
  });
});

describe("DELETE /api/tracker/fuel/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue({ id: "bike-1" });
    mocks.isBikeReadOnly.mockReturnValue(false);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await DELETE(request(), { params: { id: ownId } });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: { id: "attacker@example.com::fuel::x" } });
    expect(response.status).toBe(404);
    expect(mocks.deleteFuelLog).not.toHaveBeenCalled();
  });

  // Unlike bills/reminders (which check isBikeReadOnly against
  // getPrimaryBike), fuel/mods/services delete routes look up the
  // record's OWN bikeId and check read-only status against that
  // specific bike - worth confirming this is genuinely what happens,
  // not assuming it matches the other routes' pattern.
  it("checks read-only status against the record's own bike, looked up via its stored bikeId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await DELETE(request(), { params: { id: ownId } });

    expect(mocks.getBike).toHaveBeenCalledWith("owner@example.com", "bike-1");
    expect(response.status).toBe(403);
  });

  it("deletes a valid, owned fuel log", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: { id: ownId } });
    expect(response.status).toBe(200);
    expect(mocks.deleteFuelLog).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});