import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  isCarReadOnly: vi.fn(),
  updateCarMileage: vi.fn(),
  createCarFuelLog: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarMods: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
  checkFullTankPlausibility: vi.fn(),
  describeImplausibleFill: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  isCarReadOnly: mocks.isCarReadOnly,
  updateCarMileage: mocks.updateCarMileage,
  CAR_READ_ONLY_MESSAGE: "This car has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/carFuelLog", () => ({
  createCarFuelLog: mocks.createCarFuelLog,
  getCarFuelLogs: mocks.getCarFuelLogs,
}));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
// checkLitresPlausibility deliberately NOT imported by the real route
// (see its own header comment) - CarDoc has no tankCapacityLitres, and
// that check's fallback default is motorcycle-sized, so it would
// wrongly flag a normal car fill-up. Only checkFullTankPlausibility
// (capacity-independent) is mocked here.
vi.mock("@/lib/tracker/fuelPlausibility", () => ({
  checkFullTankPlausibility: mocks.checkFullTankPlausibility,
  describeImplausibleFill: mocks.describeImplausibleFill,
}));

import { POST } from "@/app/api/cars/car-fuel/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/cars/car-fuel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { litres: 45, cost: 60, mileage: 42000, date: "2025-06-01" };

describe("POST /api/cars/car-fuel", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", fuelType: "petrol", year: 2018, currentMileage: 40000 });
    mocks.isCarReadOnly.mockReturnValue(false);
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarFuelLogs.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.createCarFuelLog.mockResolvedValue({ id: "fuel-1" });
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(401);
  });

  it("returns not found when the account has no car yet, before validating the payload", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No car found for this account." });
  });

  // Unlike the motorcycle route, the car must be resolved FIRST here -
  // whether litres or kwh is the required field depends on the car's
  // own fuelType, so there's no way to validate the payload without it.
  it("rejects incomplete payloads only after resolving the car", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ litres: 45 })));
    expect(response.status).toBe(400);
    expect(mocks.getPrimaryCar).toHaveBeenCalled();
    expect(mocks.createCarFuelLog).not.toHaveBeenCalled();
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isCarReadOnly.mockReturnValue(true);
    const response = await POST(request(JSON.stringify(validPayload)));
    expect(response.status).toBe(403);
    expect(mocks.createCarFuelLog).not.toHaveBeenCalled();
  });

  it("rejects a date before the car's production year", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, date: "2010-01-01" })));
    expect(response.status).toBe(400);
    expect(mocks.createCarFuelLog).not.toHaveBeenCalled();
  });

  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked" });
    const response = await POST(request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })));
    expect(response.status).toBe(409);
    expect(mocks.createCarFuelLog).not.toHaveBeenCalled();
  });

  // A 60L fill would fail the motorcycle-style litres-vs-tank-capacity
  // check (its ~16L default), which is exactly why that check is never
  // run for cars at all - proven here by a large litres figure sailing
  // through with no plausibility rejection.
  it("accepts a large litres figure that would fail a motorcycle-sized tank check, since that check never runs for cars", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(request(JSON.stringify({ ...validPayload, litres: 60 })));
    expect(response.status).toBe(200);
    expect(mocks.createCarFuelLog).toHaveBeenCalled();
  });

  it("never runs the full-tank plausibility check for a partial top-up", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validPayload, filledToFull: false })));
    expect(mocks.checkFullTankPlausibility).not.toHaveBeenCalled();
  });

  it("rejects an implausible full-tank fill", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkFullTankPlausibility.mockReturnValue({ plausible: false, impliedMpg: 3 });
    mocks.describeImplausibleFill.mockReturnValue("That implies an impossible mpg.");

    const response = await POST(request(JSON.stringify({ ...validPayload, filledToFull: true })));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "That implies an impossible mpg." });
    expect(mocks.createCarFuelLog).not.toHaveBeenCalled();
  });

  it("bumps the car's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    await POST(request(JSON.stringify({ ...validPayload, mileage: 42000 })));
    expect(mocks.updateCarMileage).toHaveBeenCalledWith("owner@example.com", "car-1", 42000);
  });

  it("creates a valid petrol car's fuel log using litres", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ log: { id: "fuel-1" } });
    expect(mocks.createCarFuelLog).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      carId: "car-1",
      fuelType: "petrol",
      litres: 45,
      kwh: undefined,
      cost: 60,
      mileage: 42000,
    }));
  });

  // The one real branch this route adds beyond the motorcycle version -
  // an electric car's fuel log uses kwh instead of litres, and never
  // runs the (petrol/diesel-only) full-tank plausibility check.
  describe("electric car", () => {
    beforeEach(() => {
      mocks.getPrimaryCar.mockResolvedValue({ id: "car-1", fuelType: "electric", year: 2022, currentMileage: 40000 });
    });

    it("requires kwh, not litres", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      const response = await POST(request(JSON.stringify({ litres: 45, cost: 60, mileage: 42000, date: "2025-06-01" })));
      expect(response.status).toBe(400);
      expect(mocks.createCarFuelLog).not.toHaveBeenCalled();
    });

    it("creates the fuel log with kwh set and litres undefined, even when filledToFull is sent", async () => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

      const response = await POST(request(JSON.stringify({ kwh: 30, cost: 12, mileage: 42000, date: "2025-06-01", filledToFull: true })));

      expect(response.status).toBe(200);
      expect(mocks.checkFullTankPlausibility).not.toHaveBeenCalled();
      expect(mocks.createCarFuelLog).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
        fuelType: "electric",
        litres: undefined,
        kwh: 30,
        filledToFull: undefined,
      }));
    });
  });
});
