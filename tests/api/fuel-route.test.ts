import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  updateBikeMileage: vi.fn(),
  createFuelLog: vi.fn(),
  getFuelLogs: vi.fn(),
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  checkMileageConsistency: vi.fn(),
  describeMileageCheck: vi.fn(),
  checkLitresPlausibility: vi.fn(),
  checkFullTankPlausibility: vi.fn(),
  describeImplausibleFill: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  isBikeReadOnly: mocks.isBikeReadOnly,
  updateBikeMileage: mocks.updateBikeMileage,
  BIKE_READ_ONLY_MESSAGE: "This bike has been transferred and is now read-only.",
}));
vi.mock("@/lib/tracker/fuelLog", () => ({
  createFuelLog: mocks.createFuelLog,
  getFuelLogs: mocks.getFuelLogs,
}));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/mileageCheck", () => ({
  checkMileageConsistency: mocks.checkMileageConsistency,
  describeMileageCheck: mocks.describeMileageCheck,
}));
vi.mock("@/lib/tracker/fuelPlausibility", () => ({
  checkLitresPlausibility: mocks.checkLitresPlausibility,
  checkFullTankPlausibility: mocks.checkFullTankPlausibility,
  describeImplausibleFill: mocks.describeImplausibleFill,
}));
// Both mileageCheck.ts and fuelPlausibility.ts have their own full unit
// coverage elsewhere - mocked here so this file tests how the route
// reacts to each result, not re-proving the underlying logic.

import { POST } from "@/app/api/tracker/fuel/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tracker/fuel", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

const validPayload = { litres: 12, cost: 18, mileage: 5200, date: "2025-06-01" };

describe("POST /api/tracker/fuel", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.getPrimaryBike.mockResolvedValue({ id: "bike-1", year: 2018, currentMileage: 5000, tankCapacityLitres: 16 });
    mocks.isBikeReadOnly.mockReturnValue(false);
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.checkMileageConsistency.mockReturnValue({ status: "ok" });
    mocks.checkLitresPlausibility.mockReturnValue({ implausible: false });
    mocks.createFuelLog.mockResolvedValue({ id: "fuel-1" });
  });

  it("rejects unauthenticated requests before reading the body", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await POST(request("not-json"));

    expect(response.status).toBe(401);
  });

  it("rejects incomplete payloads before accessing the vehicle repository", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify({ litres: 12 })));

    expect(response.status).toBe(400);
    expect(mocks.getPrimaryBike).not.toHaveBeenCalled();
  });

  it("returns not found when the account has no bike yet", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getPrimaryBike.mockResolvedValue(null);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(404);
  });

  it("blocks writes to a transferred vehicle", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.isBikeReadOnly.mockReturnValue(true);

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(403);
    expect(mocks.createFuelLog).not.toHaveBeenCalled();
  });

  it("rejects a blocked mileage conflict even when the client claims it was acknowledged", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkMileageConsistency.mockReturnValue({ status: "blocked" });

    const response = await POST(request(JSON.stringify({ ...validPayload, mileageAcknowledged: true })));

    expect(response.status).toBe(409);
    expect(mocks.createFuelLog).not.toHaveBeenCalled();
  });

  // Litres-implausibility is checked independently of the mileage check,
  // and blocks regardless of mileageAcknowledged - there's no equivalent
  // "acknowledge" path for this one at all.
  it("rejects litres beyond what the tank could physically hold", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkLitresPlausibility.mockReturnValue({ implausible: true, reason: "Too much fuel for this tank." });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "Too much fuel for this tank." });
    expect(mocks.createFuelLog).not.toHaveBeenCalled();
  });

  // The distinguishing behaviour of this route versus a partial top-up:
  // the full-tank implausibility check only ever runs when filledToFull
  // is genuinely true - a partial top-up is legitimate after any
  // distance, so it must never be evaluated against this rule at all.
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
    expect(mocks.createFuelLog).not.toHaveBeenCalled();
  });

  // A null result means "nothing to compare against yet" (no preceding
  // trusted fill), not "implausible" - must not be treated as a failure.
  it("proceeds when the full-tank check has nothing to compare against", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.checkFullTankPlausibility.mockReturnValue(null);

    const response = await POST(request(JSON.stringify({ ...validPayload, filledToFull: true })));

    expect(response.status).toBe(200);
  });

  // Only logs that are either unconfirmed-but-unflagged or explicitly
  // "confirmed" get treated as trustworthy comparison points - a fuel
  // log with some other confidence value must be excluded before being
  // handed to the full-tank check.
  it("only passes trusted fuel logs into the full-tank plausibility check", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.getFuelLogs.mockResolvedValue([
      { id: "f1", mileage: 4000 }, // no mileageConfidence set - trusted by default
      { id: "f2", mileage: 4500, mileageConfidence: "confirmed" }, // explicitly trusted
      { id: "f3", mileage: 4800, mileageConfidence: "estimated" }, // not trusted - must be excluded
    ]);
    mocks.checkFullTankPlausibility.mockReturnValue({ plausible: true });

    await POST(request(JSON.stringify({ ...validPayload, filledToFull: true })));

    const [, , trustedLogs] = mocks.checkFullTankPlausibility.mock.calls[0];
    expect(trustedLogs).toEqual([{ mileage: 4000 }, { mileage: 4500 }]);
  });

  it("bumps the bike's current mileage when the new entry is higher", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    await POST(request(JSON.stringify({ ...validPayload, mileage: 5200 })));

    expect(mocks.updateBikeMileage).toHaveBeenCalledWith("owner@example.com", "bike-1", 5200);
  });

  it("creates a valid fuel log", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await POST(request(JSON.stringify(validPayload)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ log: { id: "fuel-1" } });
    expect(mocks.createFuelLog).toHaveBeenCalledWith("owner@example.com", expect.objectContaining({
      bikeId: "bike-1",
      litres: 12,
      cost: 18,
      mileage: 5200,
      filledToFull: false,
    }));
  });
});