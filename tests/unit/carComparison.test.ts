import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCarById: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarMods: vi.fn(),
  getCarBills: vi.fn(),
}));

vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.getCarBills }));
// computeCarSpendSummary/computeCarYearSpend/gatherCarMileagePoints
// (carSummary.ts), computeMPGSeries (mpgCalc.ts), and monthsBetween
// (reminderStatus.ts) are pure, no I/O - deliberately not mocked, same
// convention bikeComparison.test.ts already uses.

import { buildCarComparisonEntry, buildCarComparison } from "@/lib/tracker/carComparison";

const email = "driver@example.com";

function makeCar(overrides: Record<string, unknown> = {}) {
  return {
    id: "car-1",
    pk: email,
    type: "car",
    make: "Ford",
    model: "Focus",
    fuelType: "petrol",
    nickname: "",
    currentMileage: 10000,
    startingMileage: 2000,
    dateAdded: "2024-01-01",
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getCarById.mockResolvedValue(makeCar());
  mocks.getCarServiceRecords.mockResolvedValue([]);
  mocks.getCarFuelLogs.mockResolvedValue([]);
  mocks.getCarMods.mockResolvedValue([]);
  mocks.getCarBills.mockResolvedValue([]);
});

describe("buildCarComparisonEntry", () => {
  it("returns null when the car doesn't exist", async () => {
    mocks.getCarById.mockResolvedValue(null);
    expect(await buildCarComparisonEntry(email, "car-1")).toBeNull();
    expect(mocks.getCarServiceRecords).not.toHaveBeenCalled();
  });

  it("tags the entry with kind: 'car' and uses the car's id as bikeId", async () => {
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.kind).toBe("car");
    expect(entry?.bikeId).toBe("car-1");
  });

  // The two fields that depend on getSellerReportCore, which has no car
  // equivalent yet - always null, never a guessed/default real value.
  it("always returns null for nextDue and documentationPct - no car equivalent of getSellerReportCore exists yet", async () => {
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.nextDue).toBeNull();
    expect(entry?.documentationPct).toBeNull();
  });

  it("computes milesRidden as currentMileage minus startingMileage, not the raw odometer", async () => {
    mocks.getCarById.mockResolvedValue(makeCar({ currentMileage: 15000, startingMileage: 5000 }));
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.milesRidden).toBe(10000);
  });

  it("clamps milesRidden to 0 rather than going negative", async () => {
    mocks.getCarById.mockResolvedValue(makeCar({ currentMileage: 3000, startingMileage: 5000 }));
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.milesRidden).toBe(0);
  });

  it("computes costPerMile from real spend (servicing + mods + bills + fuel) over milesRidden", async () => {
    mocks.getCarById.mockResolvedValue(makeCar({ currentMileage: 6000, startingMileage: 1000 })); // 5000 miles ridden
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1", cost: 200, date: "2025-01-01", mileage: 3000 }]);
    mocks.getCarFuelLogs.mockResolvedValue([{ id: "fl-1", cost: 300, date: "2025-01-01", mileage: 3000, litres: 20, filledToFull: true }]);
    mocks.getCarMods.mockResolvedValue([{ id: "m-1", cost: 100, date: "2025-01-01", mileage: 3000 }]);
    mocks.getCarBills.mockResolvedValue([{ id: "bl-1", cost: 400, date: "2025-01-01" }]);
    const entry = await buildCarComparisonEntry(email, "car-1");
    // total spend 1000 over 5000 miles ridden = £0.20/mile
    expect(entry?.spend.grandTotal).toBe(1000);
    expect(entry?.costPerMile).toBeCloseTo(0.2);
  });

  it("returns null costPerMile rather than dividing by zero when no miles have been ridden yet", async () => {
    mocks.getCarById.mockResolvedValue(makeCar({ currentMileage: 1000, startingMileage: 1000 }));
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.milesRidden).toBe(0);
    expect(entry?.costPerMile).toBeNull();
  });

  it("picks the most recently dated service record as lastService", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([
      { id: "sr-1", cost: 50, date: "2024-01-01", mileage: 3000 },
      { id: "sr-2", cost: 60, date: "2025-06-01", mileage: 8000 },
    ]);
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.lastServiceDate).toBe("2025-06-01");
    expect(entry?.lastServiceMileage).toBe(8000);
  });

  it("builds the display name from nickname + make + model when a nickname is set", async () => {
    mocks.getCarById.mockResolvedValue(makeCar({ nickname: "The Runabout" }));
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.name).toBe("The Runabout - Ford Focus");
  });

  // Distinct from the bike side - a car fuel log can be a pure electric
  // charging session (kwh, no litres at all), which the MPG calc can't
  // use and must be filtered out rather than passed through as 0 litres.
  it("computes actualMpg only from litres-based fuel logs, excluding electric charging sessions", async () => {
    mocks.getCarFuelLogs.mockResolvedValue([
      { id: "f1", date: "2025-01-01", mileage: 1000, litres: 40, filledToFull: true, cost: 60 },
      { id: "f2", date: "2025-02-01", mileage: 1300, litres: 45.46, filledToFull: true, cost: 65 }, // 300mi/10gal = 30mpg
      { id: "f3", date: "2025-03-01", mileage: 1400, kwh: 40, cost: 12 }, // no litres - electric, must not throw/skew the calc
    ]);
    const entry = await buildCarComparisonEntry(email, "car-1");
    expect(entry?.actualMpg).toBeCloseTo(30, 1);
  });
});

describe("buildCarComparisonEntry with a date-range period", () => {
  it("filters spend to only entries dated within the period", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([
      { id: "sr-1", cost: 100, date: "2024-06-01", mileage: 2000 }, // before period
      { id: "sr-2", cost: 200, date: "2025-03-01", mileage: 4000 }, // in period
    ]);
    mocks.getCarBills.mockResolvedValue([
      { id: "bl-1", cost: 300, date: "2025-08-01" }, // after period
    ]);
    const entry = await buildCarComparisonEntry(email, "car-1", { from: "2025-01-01", to: "2025-06-01" });
    expect(entry?.spend.servicingTotal).toBe(200);
    expect(entry?.spend.billsTotal).toBe(0);
    expect(entry?.spend.grandTotal).toBe(200);
  });

  it("returns yearSpend null once a custom period is active, rather than a second, confusing spend figure", async () => {
    const entry = await buildCarComparisonEntry(email, "car-1", { from: "2025-01-01" });
    expect(entry?.yearSpend).toBeNull();
  });

  it("keeps nextDue/documentationPct null regardless of any period filter", async () => {
    const entry = await buildCarComparisonEntry(email, "car-1", { from: "2025-01-01", to: "2025-02-01" });
    expect(entry?.nextDue).toBeNull();
    expect(entry?.documentationPct).toBeNull();
  });
});

describe("buildCarComparison", () => {
  it("fetches every requested car and filters out ones that didn't resolve", async () => {
    mocks.getCarById.mockImplementation(async (_email: string, carId: string) =>
      carId === "missing" ? null : makeCar({ id: carId })
    );
    const result = await buildCarComparison(email, ["car-1", "missing", "car-2"]);
    expect(result.map((e) => e.bikeId)).toEqual(["car-1", "car-2"]);
  });

  it("returns an empty array when none of the requested cars resolve", async () => {
    mocks.getCarById.mockResolvedValue(null);
    const result = await buildCarComparison(email, ["a", "b"]);
    expect(result).toEqual([]);
  });
});
