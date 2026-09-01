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

  it("returns correct counts matching the dataset", async () => {
    const result = await runDemoSeed();
    expect(result).toEqual({ fuel: 1, service: 1, mods: 1, bills: 2 });
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
});
