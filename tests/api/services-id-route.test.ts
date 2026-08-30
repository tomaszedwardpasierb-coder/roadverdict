import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getBike: vi.fn(),
  getPrimaryBike: vi.fn(),
  updateBikeMileage: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateServiceRecord: vi.fn(),
  deleteServiceRecord: vi.fn(),
  getServiceRecords: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
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
vi.mock("@/lib/tracker/serviceRecord", () => ({
  updateServiceRecord: mocks.updateServiceRecord,
  deleteServiceRecord: mocks.deleteServiceRecord,
  getServiceRecords: mocks.getServiceRecords,
}));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ getTrackerDocById: mocks.getTrackerDocById }));

import { PATCH, DELETE } from "@/app/api/tracker/services/[id]/route";

function request(body?: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/services/x", {
    method: body ? "PATCH" : "DELETE",
    headers: body ? { "content-type": "application/json" } : undefined,
    body,
  });
}

const ownId = "owner@example.com::service::abc123";
const validPayload = { jobType: "full-service", cost: 180, mileage: 5200, date: "2025-06-01" };

describe("PATCH /api/tracker/services/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: undefined });
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.updateServiceRecord.mockResolvedValue({ id: ownId });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await PATCH(request("{}"), { params: { id: ownId } });
    expect(response.status).toBe(401);
  });

  it("refuses an id prefixed with a different owner's email, without ever calling updateServiceRecord", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: "attacker@example.com::service::x" } });
    expect(response.status).toBe(404);
    expect(mocks.updateServiceRecord).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });
    expect(response.status).toBe(403);
    expect(mocks.updateServiceRecord).not.toHaveBeenCalled();
  });

  it.each(["estimated", "interpolated"])("promotes a %s mileage confidence to confirmed on edit", async (confidence) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getTrackerDocById.mockResolvedValue({ bikeId: "bike-1", mileageConfidence: confidence });

    await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });

    expect(mocks.updateServiceRecord).toHaveBeenCalledWith(
      "owner@example.com", ownId, expect.objectContaining({ mileageConfidence: "confirmed" })
    );
  });

  it("excludes the record's own id from the mileage-consistency check", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });
    expect(mocks.checkMileageConsistency.mock.calls[0][4]).toBe(ownId);
  });

  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked" });
    const response = await PATCH(
      request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })), { params: { id: ownId } }
    );
    expect(response.status).toBe(409);
    expect(mocks.updateServiceRecord).not.toHaveBeenCalled();
  });

  it("bumps the bike's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(request(JSON.stringify({ ...validPayload, mileage: 5200 })), { params: { id: ownId } });
    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 5200);
  });

  // The exact documented bug this guards against: the review queue
  // deliberately omits `attachments` from its payload, and an explicit
  // `attachments: undefined` in the update call would still overwrite
  // the existing value during the Cosmos merge (a present key beats an
  // absent one, even when its value is undefined) - silently wiping
  // every attachment saved through that flow.
  it("omits attachments from the update entirely when the caller doesn't send any, rather than wiping existing ones", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } }); // no attachments field sent

    const updatePayload = mocks.updateServiceRecord.mock.calls[0][2];
    expect("attachments" in updatePayload).toBe(false);
  });

  it("includes attachments in the update when the caller explicitly sends them, even an empty array", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await PATCH(request(JSON.stringify({ ...validPayload, attachments: [] })), { params: { id: ownId } });

    const updatePayload = mocks.updateServiceRecord.mock.calls[0][2];
    expect(updatePayload.attachments).toEqual([]);
  });

  it("clears any existing reminder for the job type before creating a new one, same as the create route", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await PATCH(
      request(JSON.stringify({ ...validPayload, reminder: { intervalType: "mileage", intervalValue: 6000 } })),
      { params: { id: ownId } }
    );
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", "service:full-service");
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({ sourceKey: "service:full-service" }));
  });

  it("returns not found when the update itself finds nothing to update", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.updateServiceRecord.mockResolvedValue(null);
    const response = await PATCH(request(JSON.stringify(validPayload)), { params: { id: ownId } });
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/tracker/services/[id]", () => {
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
    const response = await DELETE(request(), { params: { id: "attacker@example.com::service::x" } });
    expect(response.status).toBe(404);
    expect(mocks.deleteServiceRecord).not.toHaveBeenCalled();
  });

  it("checks read-only status against the record's own bike, looked up via its stored bikeId", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);
    const response = await DELETE(request(), { params: { id: ownId } });
    expect(mocks.getBike).toHaveBeenCalledWith("owner@example.com", "bike-1");
    expect(response.status).toBe(403);
  });

  it("deletes a valid, owned service record", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await DELETE(request(), { params: { id: ownId } });
    expect(response.status).toBe(200);
    expect(mocks.deleteServiceRecord).toHaveBeenCalledWith("owner@example.com", ownId);
  });
});