import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBikesForUser: vi.fn(),
  createBike: vi.fn(),
  deleteBike: vi.fn(),
  getBikeClassForCC: vi.fn(),
  createServiceRecord: vi.fn(),
  createFuelLog: vi.fn(),
  createMod: vi.fn(),
  createBill: vi.fn(),
  createReminder: vi.fn(),
  generateDemoDataset: vi.fn(),
  getCarsForUser: vi.fn(),
  createCar: vi.fn(),
  deleteCar: vi.fn(),
  createCarServiceRecord: vi.fn(),
  createCarFuelLog: vi.fn(),
  createCarMod: vi.fn(),
  createCarBill: vi.fn(),
  createCarReminder: vi.fn(),
  generateDemoCarDataset: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  createBike: mocks.createBike,
  deleteBike: mocks.deleteBike,
}));
vi.mock("@/lib/motorcycleModels", () => ({ getBikeClassForCC: mocks.getBikeClassForCC }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ createServiceRecord: mocks.createServiceRecord }));
vi.mock("@/lib/tracker/fuelLog", () => ({ createFuelLog: mocks.createFuelLog }));
vi.mock("@/lib/tracker/mod", () => ({ createMod: mocks.createMod }));
vi.mock("@/lib/tracker/bill", () => ({ createBill: mocks.createBill }));
vi.mock("@/lib/tracker/reminder", () => ({ createReminder: mocks.createReminder }));
vi.mock("@/lib/tracker/demoSeed", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tracker/demoSeed")>();
  return {
    ...real, // keep constants (DEMO_EMAIL, DEMO_MAKE etc.)
    generateDemoDataset: mocks.generateDemoDataset,
  };
});
vi.mock("@/lib/tracker/car", () => ({
  getCarsForUser: mocks.getCarsForUser,
  createCar: mocks.createCar,
  deleteCar: mocks.deleteCar,
}));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ createCarServiceRecord: mocks.createCarServiceRecord }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ createCarFuelLog: mocks.createCarFuelLog }));
vi.mock("@/lib/tracker/carMod", () => ({ createCarMod: mocks.createCarMod }));
vi.mock("@/lib/tracker/carBill", () => ({ createCarBill: mocks.createCarBill }));
vi.mock("@/lib/tracker/carReminder", () => ({ createCarReminder: mocks.createCarReminder }));
vi.mock("@/lib/tracker/demoCarSeed", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/tracker/demoCarSeed")>();
  return {
    ...real, // keep constants (DEMO_CAR_MAKE etc.)
    generateDemoCarDataset: mocks.generateDemoCarDataset,
  };
});

import { demoBikeExists, runDemoSeed } from "@/lib/tracker/demoSeedRunner";

const minimalDataset = {
  fuel: [{ date: "2025-01-01", mileage: 1000, litres: 12, cost: 20, filledToFull: true }],
  service: [{ jobType: "basic-service", date: "2025-06-01", mileage: 5000, cost: 80 }],
  mods: [{ category: "exhaust-can", name: "Akrapovic", date: "2025-03-01", mileage: 3000, cost: 300 }],
  bills: [
    { billType: "insurance", date: "2025-01-01", cost: 300 },
    { billType: "road-tax", date: "2025-01-01", cost: 85 },
  ],
  finalMileage: 6000,
};

const minimalCarDataset = {
  fuel: [{ date: "2025-01-01", mileage: 30000, litres: 50, cost: 75, filledToFull: true }],
  service: [{ jobType: "interim-service", date: "2025-06-01", mileage: 35000, cost: 220 }],
  mods: [{ category: "dash-cam", name: "Dash cam", date: "2025-03-01", mileage: 33000, cost: 89 }],
  bills: [
    { billType: "insurance", date: "2025-01-01", cost: 500 },
    { billType: "road-tax", date: "2025-01-01", cost: 315 },
  ],
  finalMileage: 40000,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getBikesForUser.mockResolvedValue([]);
  mocks.createBike.mockResolvedValue({ ok: true, bike: { id: "demo-bike-id" } });
  mocks.deleteBike.mockResolvedValue(undefined);
  mocks.getBikeClassForCC.mockReturnValue("medium");
  mocks.createServiceRecord.mockResolvedValue(undefined);
  mocks.createFuelLog.mockResolvedValue(undefined);
  mocks.createMod.mockResolvedValue(undefined);
  mocks.createBill.mockResolvedValue(undefined);
  mocks.createReminder.mockResolvedValue(undefined);
  mocks.generateDemoDataset.mockReturnValue(minimalDataset);
  mocks.getCarsForUser.mockResolvedValue([]);
  mocks.createCar.mockResolvedValue({ id: "demo-car-id" });
  mocks.deleteCar.mockResolvedValue(undefined);
  mocks.createCarServiceRecord.mockResolvedValue(undefined);
  mocks.createCarFuelLog.mockResolvedValue(undefined);
  mocks.createCarMod.mockResolvedValue(undefined);
  mocks.createCarBill.mockResolvedValue(undefined);
  mocks.createCarReminder.mockResolvedValue(undefined);
  mocks.generateDemoCarDataset.mockReturnValue(minimalCarDataset);
});

describe("demoBikeExists", () => {
  it("returns false when the demo account has no bikes", async () => {
    const result = await demoBikeExists();
    expect(result).toBe(false);
  });

  it("returns true when the demo account has at least one bike", async () => {
    mocks.getBikesForUser.mockResolvedValue([{ id: "demo-bike-id" }]);
    const result = await demoBikeExists();
    expect(result).toBe(true);
  });
});

describe("runDemoSeed", () => {
  it("deletes any existing demo bikes before creating new ones", async () => {
    mocks.getBikesForUser.mockResolvedValue([{ id: "old-bike-1" }, { id: "old-bike-2" }]);
    await runDemoSeed();
    expect(mocks.deleteBike).toHaveBeenCalledTimes(2);
  });

  it("deletes any existing demo cars before creating a new one", async () => {
    mocks.getCarsForUser.mockResolvedValue([{ id: "old-car-1" }]);
    await runDemoSeed();
    expect(mocks.deleteCar).toHaveBeenCalledTimes(1);
  });

  it("creates the demo car with the correct make and model", async () => {
    await runDemoSeed();
    expect(mocks.createCar).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      expect.objectContaining({ make: "BMW", model: "640i Gran Coupe", registration: "PA63 ERB" })
    );
  });

  it("sets the car's currentMileage from the car dataset's finalMileage", async () => {
    await runDemoSeed();
    expect(mocks.createCar).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ currentMileage: 40000 }));
  });

  it("creates the demo bike with the correct make and model", async () => {
    await runDemoSeed();
    expect(mocks.createBike).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      expect.objectContaining({ make: "Yamaha", model: "MT-07" })
    );
  });

  it("sets currentMileage from dataset.finalMileage", async () => {
    await runDemoSeed();
    expect(mocks.createBike).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ currentMileage: 6000 })
    );
  });

  it("throws when createBike fails", async () => {
    mocks.createBike.mockResolvedValue({ ok: false });
    await expect(runDemoSeed()).rejects.toThrow("Could not create the demo bike.");
  });

  it("creates one fuel log per dataset fuel entry", async () => {
    await runDemoSeed();
    expect(mocks.createFuelLog).toHaveBeenCalledTimes(1);
  });

  it("creates one service record per dataset service entry", async () => {
    await runDemoSeed();
    expect(mocks.createServiceRecord).toHaveBeenCalledTimes(1);
  });

  it("creates one mod per dataset mods entry", async () => {
    await runDemoSeed();
    expect(mocks.createMod).toHaveBeenCalledTimes(1);
  });

  it("creates one bill per dataset bills entry", async () => {
    await runDemoSeed();
    expect(mocks.createBill).toHaveBeenCalledTimes(2);
  });

  it("creates one car fuel log per car dataset fuel entry", async () => {
    await runDemoSeed();
    expect(mocks.createCarFuelLog).toHaveBeenCalledTimes(1);
  });

  it("creates one car service record per car dataset service entry", async () => {
    await runDemoSeed();
    expect(mocks.createCarServiceRecord).toHaveBeenCalledTimes(1);
  });

  it("creates one car mod per car dataset mods entry", async () => {
    await runDemoSeed();
    expect(mocks.createCarMod).toHaveBeenCalledTimes(1);
  });

  it("creates one car bill per car dataset bills entry", async () => {
    await runDemoSeed();
    expect(mocks.createCarBill).toHaveBeenCalledTimes(2);
  });

  it("creates a mileage-based interim-service reminder from the car's last service entry", async () => {
    await runDemoSeed();
    expect(mocks.createCarReminder).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      expect.objectContaining({ carId: "demo-car-id", intervalType: "mileage", sourceKey: "service:interim-service" })
    );
  });

  it("creates a months-based insurance reminder from the car's last insurance bill", async () => {
    await runDemoSeed();
    expect(mocks.createCarReminder).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      expect.objectContaining({ carId: "demo-car-id", intervalType: "months", sourceKey: "bill:insurance" })
    );
  });

  it("creates a mileage-based service reminder from the last service entry", async () => {
    await runDemoSeed();
    expect(mocks.createReminder).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      expect.objectContaining({ intervalType: "mileage", sourceKey: "service:basic-service" })
    );
  });

  it("creates a months-based insurance reminder from the last insurance bill", async () => {
    await runDemoSeed();
    expect(mocks.createReminder).toHaveBeenCalledWith(
      "demo@roadverdict.co.uk",
      expect.objectContaining({ intervalType: "months", sourceKey: "bill:insurance" })
    );
  });

  it("returns correct counts matching both datasets", async () => {
    const result = await runDemoSeed();
    expect(result).toEqual({ fuel: 1, service: 1, mods: 1, bills: 2, carFuel: 1, carService: 1, carMods: 1, carBills: 2 });
  });

  it("does not create reminders when dataset has no service or insurance entries", async () => {
    mocks.generateDemoDataset.mockReturnValue({
      ...minimalDataset,
      service: [],
      bills: [{ billType: "road-tax", date: "2025-01-01", cost: 85 }],
    });
    await runDemoSeed();
    expect(mocks.createReminder).not.toHaveBeenCalled();
  });

  it("does not create car reminders when the car dataset has no service or insurance entries", async () => {
    mocks.generateDemoCarDataset.mockReturnValue({
      ...minimalCarDataset,
      service: [],
      bills: [{ billType: "road-tax", date: "2025-01-01", cost: 315 }],
    });
    await runDemoSeed();
    expect(mocks.createCarReminder).not.toHaveBeenCalled();
  });
});
