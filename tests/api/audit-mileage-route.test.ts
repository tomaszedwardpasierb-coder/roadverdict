import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarMods: vi.fn(),
  updateTrackerDoc: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: mocks.query },
  }),
}));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  updateTrackerDoc: mocks.updateTrackerDoc,
}));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));

import { POST } from "@/app/api/cron/audit-mileage/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/audit-mileage", { method: "POST", headers });
}

// The route runs two separate container.items.query calls (bikes, then
// cars) against the exact same mocked query function - this switches on
// which type the query string is actually asking for, so each call gets
// its own fixture rather than one mock accidentally serving both.
function setupQuery(bikes: unknown[], cars: unknown[] = []) {
  mocks.query.mockImplementation((queryObj: { query: string }) => {
    const resources = queryObj.query.includes("'car'") ? cars : bikes;
    return { fetchAll: () => Promise.resolve({ resources }) };
  });
}

describe("POST /api/cron/audit-mileage", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarFuelLogs.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
    mocks.updateTrackerDoc.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects every request when CRON_SECRET isn't configured, even with a matching-looking header", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("no-ops cleanly when there are no bikes or cars at all", async () => {
    setupQuery([], []);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      bikesProcessed: 0, carsProcessed: 0, recordsFlagged: 0, perBike: [], perCar: [],
    });
  });

  it("leaves manually-logged records (no mileageConfidence tag) untouched even if mileage looks inconsistent", async () => {
    setupQuery([{ id: "bike-1", pk: "owner@example.com" }]);
    mocks.getServiceRecords.mockResolvedValue([
      { id: "s1", date: "2025-01-01", mileage: 5000 },
      { id: "s2", date: "2025-02-01", mileage: 4000 }, // decreasing, but never AI-tagged
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body).toEqual({ bikesProcessed: 1, carsProcessed: 0, recordsFlagged: 0, perBike: [], perCar: [] });
    expect(mocks.updateTrackerDoc).not.toHaveBeenCalled();
  });

  it("flags AI-derived records whose mileage is chronologically inconsistent, downgrading confirmed back to estimated", async () => {
    setupQuery([{ id: "bike-1", pk: "owner@example.com" }]);
    mocks.getServiceRecords.mockResolvedValue([
      { id: "s1", date: "2025-01-01", mileage: 5000, mileageConfidence: "confirmed" },
      { id: "s2", date: "2025-02-01", mileage: 4000, mileageConfidence: "estimated" },
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bikesProcessed).toBe(1);
    expect(body.recordsFlagged).toBe(2);
    expect(body.perBike).toEqual([{ email: "owner@example.com", bikeId: "bike-1", flagged: 2 }]);
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith("owner@example.com", "s1", {
      needsReview: true,
      mileageConfidence: "estimated",
      mileageConflictWarning: expect.stringContaining("chronologically inconsistent"),
    });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith("owner@example.com", "s2", expect.objectContaining({
      mileageConfidence: "estimated",
    }));
  });

  it("checks every bike independently and sums recordsFlagged across all of them", async () => {
    setupQuery([
      { id: "bike-1", pk: "owner1@example.com" },
      { id: "bike-2", pk: "owner2@example.com" },
    ]);
    mocks.getServiceRecords.mockImplementation(async (email: string) => {
      if (email === "owner1@example.com") {
        return [
          { id: "a1", date: "2025-01-01", mileage: 5000, mileageConfidence: "estimated" },
          { id: "a2", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" },
        ];
      }
      return [];
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body.bikesProcessed).toBe(2);
    expect(body.recordsFlagged).toBe(2);
    expect(body.perBike).toEqual([{ email: "owner1@example.com", bikeId: "bike-1", flagged: 2 }]);
  });

  it("isolates a single bike's failure and still audits every other bike in the run", async () => {
    setupQuery([
      { id: "bike-1", pk: "owner1@example.com" },
      { id: "bike-2", pk: "owner2@example.com" },
    ]);
    mocks.getServiceRecords.mockImplementation(async (email: string) => {
      if (email === "owner1@example.com") throw new Error("Cosmos read failed");
      return [
        { id: "a1", date: "2025-01-01", mileage: 5000, mileageConfidence: "estimated" },
        { id: "a2", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" },
      ];
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.bikesProcessed).toBe(2);
    // bike-2 was still reached and flagged, despite bike-1's failure.
    expect(mocks.getServiceRecords).toHaveBeenCalledWith("owner2@example.com", "bike-2");
    expect(body.recordsFlagged).toBe(2);
    expect(body.perBike).toEqual([{ email: "owner2@example.com", bikeId: "bike-2", flagged: 2 }]);
    expect(body.errors).toEqual([
      { email: "owner1@example.com", bikeId: "bike-1", error: "Cosmos read failed" },
    ]);
  });

  // ── Cars - mirrors the bike coverage above ──────────────────────────────

  it("flags AI-derived car records whose mileage is chronologically inconsistent, downgrading confirmed back to estimated", async () => {
    setupQuery([], [{ id: "car-1", pk: "owner@example.com" }]);
    mocks.getCarServiceRecords.mockResolvedValue([
      { id: "s1", date: "2025-01-01", mileage: 5000, mileageConfidence: "confirmed" },
      { id: "s2", date: "2025-02-01", mileage: 4000, mileageConfidence: "estimated" },
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.carsProcessed).toBe(1);
    expect(body.recordsFlagged).toBe(2);
    expect(body.perCar).toEqual([{ email: "owner@example.com", carId: "car-1", flagged: 2 }]);
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith("owner@example.com", "s1", {
      needsReview: true,
      mileageConfidence: "estimated",
      mileageConflictWarning: expect.stringContaining("chronologically inconsistent"),
    });
  });

  it("isolates a single car's failure and still audits every other car in the run", async () => {
    setupQuery([], [
      { id: "car-1", pk: "owner1@example.com" },
      { id: "car-2", pk: "owner2@example.com" },
    ]);
    mocks.getCarServiceRecords.mockImplementation(async (email: string) => {
      if (email === "owner1@example.com") throw new Error("Cosmos read failed");
      return [
        { id: "a1", date: "2025-01-01", mileage: 5000, mileageConfidence: "estimated" },
        { id: "a2", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" },
      ];
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.carsProcessed).toBe(2);
    expect(body.recordsFlagged).toBe(2);
    expect(body.perCar).toEqual([{ email: "owner2@example.com", carId: "car-2", flagged: 2 }]);
    expect(body.errors).toEqual([
      { email: "owner1@example.com", carId: "car-1", error: "Cosmos read failed" },
    ]);
  });

  it("excludes electric-only fuel logs (no litres) from the implausible-fill-up check", async () => {
    setupQuery([], [{ id: "car-1", pk: "owner@example.com" }]);
    mocks.getCarFuelLogs.mockResolvedValue([
      { id: "f1", date: "2025-01-01", mileage: 1000, kwh: 40, mileageConfidence: "estimated" },
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recordsFlagged).toBe(0);
  });

  it("audits bikes and cars in the same run, counted into the same recordsFlagged total", async () => {
    setupQuery(
      [{ id: "bike-1", pk: "owner1@example.com" }],
      [{ id: "car-1", pk: "owner2@example.com" }]
    );
    mocks.getServiceRecords.mockResolvedValue([
      { id: "b1", date: "2025-01-01", mileage: 5000, mileageConfidence: "estimated" },
      { id: "b2", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" },
    ]);
    mocks.getCarServiceRecords.mockResolvedValue([
      { id: "c1", date: "2025-01-01", mileage: 5000, mileageConfidence: "estimated" },
      { id: "c2", date: "2025-02-01", mileage: 1000, mileageConfidence: "estimated" },
    ]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body.bikesProcessed).toBe(1);
    expect(body.carsProcessed).toBe(1);
    expect(body.recordsFlagged).toBe(4);
    expect(body.perBike).toEqual([{ email: "owner1@example.com", bikeId: "bike-1", flagged: 2 }]);
    expect(body.perCar).toEqual([{ email: "owner2@example.com", carId: "car-1", flagged: 2 }]);
  });
});
