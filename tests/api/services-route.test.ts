import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateBikeMileage: vi.fn(),
  createServiceRecord: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  updateBikeMileage: mocks.updateBikeMileage,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/serviceRecord", () => ({
  createServiceRecord: mocks.createServiceRecord,
  getServiceRecords: mocks.getServiceRecords,
}));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
// jobTypes.ts (JOB_LABELS) and productionYearCheck.ts (isBeforeProduction)
// are deliberately NOT mocked - both pure, no I/O. checkMileageConsistency
// itself is mocked here rather than exercised for real, since its own
// logic already has full coverage in mileageCheck.test.ts - what matters
// in THIS file is how the route reacts to each status, not re-proving
// the status is computed correctly.

import { POST } from "@/app/api/tracker/services/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/services", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { jobType: "full-service", cost: 180, mileage: 5200, date: "2025-06-01" };

describe("POST /api/tracker/services", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", year: 2018, currentMileage: 5000 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.describeMileageCheck.mockReturnValue("Mileage conflict.");
    mocks.createServiceRecord.mockResolvedValue({ id: "svc-1" });
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

    const response = await POST(request(JSON.stringify({ jobType: "full-service" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No bike found for this account." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(403);
    expect(mocks.createServiceRecord).not.toHaveBeenCalled();
  });

  it("rejects a date before the bike's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2010-01-01" })));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "This date is before 2018, when this bike was made." });
    expect(mocks.createServiceRecord).not.toHaveBeenCalled();
  });

  // Checks that all three other record types actually get pulled in and
  // combined, not just service records - this route's whole point is
  // catching a conflict against ANY of the bike's logged history, not
  // just entries of the same type.
  it("checks mileage consistency against service records, fuel logs, and mods combined", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getServiceRecords.mockResolvedValue([{ id: "s1", date: "2025-01-01", mileage: 4000 }]);
    mocks.getFuelLogs.mockResolvedValue([{ id: "f1", date: "2025-02-01", mileage: 4500 }]);
    mocks.getMods.mockResolvedValue([{ id: "m1", date: "2025-03-01", mileage: 4800 }]);

    await POST(request(JSON.stringify(validPayload)));

    const [, , history] = mocks.checkMileageConsistency.mock.calls[0];
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "s1" }),
      expect.objectContaining({ id: "f1" }),
      expect.objectContaining({ id: "m1" }),
    ]));
  });

  // The security guarantee the source comment states explicitly: a
  // blocked result is never overridable, no matter what the client
  // claims - unlike the old system's single undifferentiated
  // mileageAcknowledged flag, which could be sent regardless of
  // whether the UI ever actually offered that option.
  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked", reason: "today-lower" });

    const response = await POST(request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })));

    expect(response.status).toBe(409);
    expect(mocks.createServiceRecord).not.toHaveBeenCalled();
  });

  it("rejects an unacknowledged mileage warning", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "warning", reason: "below-earlier" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(409);
    expect(mocks.createServiceRecord).not.toHaveBeenCalled();
  });

  it("allows a mileage warning through once the client acknowledges it", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "warning", reason: "below-earlier" });

    const response = await POST(request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })));

    expect(response.status).toBe(200);
    expect(mocks.createServiceRecord).toHaveBeenCalled();
  });

  it("bumps the bike's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(request(JSON.stringify({ ...validPayload, mileage: 5200 })));

    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 5200);
  });

  it("does not touch the bike's current mileage when the new entry is lower or equal", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(request(JSON.stringify({ ...validPayload, mileage: 5000 })));

    expect(mocks.updateBikeMileage).not.toHaveBeenCalled();
  });

  it("creates a valid service record with no reminder requested", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ record: { id: "svc-1" } });
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });

  it("creates a reminder alongside the service, clearing any existing one for the same job type first", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(request(JSON.stringify({
      ...validPayload,
      reminder: { intervalType: "mileage", intervalValue: 6000 },
    })));

    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "bike-1", "service:full-service");
    expect(mocks.createReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      name: "Full service",
      intervalType: "mileage",
      intervalValue: 6000,
      baseMileage: 5200,
      sourceKey: "service:full-service",
    }));
  });
});