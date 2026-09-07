import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  updateCarMileage: vi.fn(),
  createCarServiceRecord: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarMods: vi.fn(),
  createCarReminder: vi.fn(),
  deleteCarRemindersBySourceKey: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  updateCarMileage: mocks.updateCarMileage,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carServiceRecord", () => ({
  createCarServiceRecord: mocks.createCarServiceRecord,
  getCarServiceRecords: mocks.getCarServiceRecords,
}));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carReminder", () => ({
  createCarReminder: mocks.createCarReminder,
  deleteCarRemindersBySourceKey: mocks.deleteCarRemindersBySourceKey,
}));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
// carJobTypes.ts (CAR_JOB_LABELS) and productionYearCheck.ts
// (isBeforeProduction) deliberately NOT mocked - both pure, no I/O.

import { POST } from "@/app/api/cars/car-services/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-services", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { jobType: "cambelt", cost: 350, mileage: 42000, date: "2025-06-01" };

describe("POST /api/cars/car-services", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", year: 2018, currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarFuelLogs.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.describeMileageCheck.mockReturnValue("Mileage conflict.");
    mocks.createCarServiceRecord.mockResolvedValue({ id: "svc-1" });
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
    const response = await POST(request(JSON.stringify({ jobType: "cambelt" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Please fill in all required fields." });
    expect(mocks.getPrimaryCar).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no car yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(403);
    expect(mocks.createCarServiceRecord).not.toHaveBeenCalled();
  });

  it("rejects a date before the car's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2010-01-01" })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "This date is before 2018, when this car was made." });
    expect(mocks.createCarServiceRecord).not.toHaveBeenCalled();
  });

  it("checks mileage consistency against car service records, fuel logs, and mods combined", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "s1", date: "2025-01-01", mileage: 40100 }]);
    mocks.getCarFuelLogs.mockResolvedValue([{ id: "f1", date: "2025-02-01", mileage: 40500 }]);
    mocks.getCarMods.mockResolvedValue([{ id: "m1", date: "2025-03-01", mileage: 40800 }]);

    await POST(request(JSON.stringify(validPayload)));

    const [, , history] = mocks.checkMileageConsistency.mock.calls[0];
    expect(history).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "s1" }),
      expect.objectContaining({ id: "f1" }),
      expect.objectContaining({ id: "m1" }),
    ]));
  });

  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked", reason: "today-lower" });
    const response = await POST(request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })));
    expect(response.status).toBe(409);
    expect(mocks.createCarServiceRecord).not.toHaveBeenCalled();
  });

  it("rejects an unacknowledged mileage warning", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "warning", reason: "below-earlier" });
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(409);
    expect(mocks.createCarServiceRecord).not.toHaveBeenCalled();
  });

  it("allows a mileage warning through once the client acknowledges it", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "warning", reason: "below-earlier" });
    const response = await POST(request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })));
    expect(response.status).toBe(200);
    expect(mocks.createCarServiceRecord).toHaveBeenCalled();
  });

  it("bumps the car's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validPayload, mileage: 42000 })));
    expect(mocks.updateCarMileage).toHaveBeenCalledWith("owner@example.com", "car-1", 42000);
  });

  it("does not touch the car's current mileage when the new entry is lower or equal", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validPayload, mileage: 40000 })));
    expect(mocks.updateCarMileage).not.toHaveBeenCalled();
  });

  it("creates a valid car service record with no reminder requested", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ record: { id: "svc-1" } });
    expect(mocks.createCarReminder).not.toHaveBeenCalled();
  });

  it("creates a reminder alongside the service, keyed carService:<jobType>, clearing any existing one first", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(request(JSON.stringify({
      ...validPayload,
      reminder: { intervalType: "mileage", intervalValue: 60000 },
    })));

    expect(mocks.deleteCarRemindersBySourceKey).toHaveBeenCalledWith("owner@example.com", "car-1", "carService:cambelt");
    expect(mocks.createCarReminder).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      carId: "car-1",
      intervalType: "mileage",
      intervalValue: 60000,
      baseMileage: 42000,
      sourceKey: "carService:cambelt",
    }));
  });
});
