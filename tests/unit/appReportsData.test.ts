import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBike: vi.fn(),
  getCarById: vi.fn(),
  materializeAllDueForBike: vi.fn(),
  materializeAllDueForCar: vi.fn(),
  bike: { records: vi.fn(), fuel: vi.fn(), mods: vi.fn(), bills: vi.fn(), labour: vi.fn() },
  car: { records: vi.fn(), fuel: vi.fn(), mods: vi.fn(), bills: vi.fn(), labour: vi.fn() },
  getExchangeRates: vi.fn(),
  getProStatus: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getBikesForUser: vi.fn(),
  countActiveBikes: vi.fn(),
  getCurrentRegistration: (b: { registration?: string }) => b.registration,
  isBikeReadOnly: (b: { transferredAt?: string }) => !!b.transferredAt,
}));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getCarsForUser: vi.fn(),
  countActiveCars: vi.fn(),
  getCurrentRegistration: (c: { registration?: string }) => c.registration,
  isCarReadOnly: (c: { transferredAt?: string }) => !!c.transferredAt,
}));
vi.mock("@/lib/tracker/activeVehicle", () => ({ resolveActiveVehicle: vi.fn() }));
vi.mock("@/lib/tracker/billSeries", () => ({ materializeAllDueForBike: mocks.materializeAllDueForBike }));
vi.mock("@/lib/tracker/carBillSeries", () => ({ materializeAllDueForCar: mocks.materializeAllDueForCar }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.bike.records }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.bike.fuel }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.bike.mods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.bike.bills }));
vi.mock("@/lib/tracker/labour", () => ({ getLabour: mocks.bike.labour }));
vi.mock("@/lib/tracker/fine", () => ({ getFines: vi.fn() }));
vi.mock("@/lib/tracker/toll", () => ({ getTolls: vi.fn() }));
vi.mock("@/lib/tracker/reminder", () => ({ getReminders: vi.fn(), computeReminderStatus: vi.fn(), reminderDetailLabel: vi.fn() }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.car.records }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.car.fuel }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.car.mods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.car.bills }));
vi.mock("@/lib/tracker/carLabour", () => ({ getCarLabour: mocks.car.labour }));
vi.mock("@/lib/tracker/carFine", () => ({ getCarFines: vi.fn() }));
vi.mock("@/lib/tracker/carToll", () => ({ getCarTolls: vi.fn() }));
vi.mock("@/lib/tracker/carReminder", () => ({ getCarReminders: vi.fn() }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));
vi.mock("@/lib/subscriptions", () => ({ getProStatus: mocks.getProStatus }));

import { getReports } from "@/lib/app/reportsData";

const email = "rider@example.com";
const NOW = new Date("2026-09-25T12:00:00Z");
const bike = { id: "bike-1", make: "Yamaha", model: "MT-07", registration: "YA16 MTO", currentMileage: 35200, startingMileage: 29000 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const group of [mocks.bike, mocks.car]) Object.values(group).forEach((m) => m.mockReset().mockResolvedValue([]));
  mocks.getBike.mockReset().mockResolvedValue(bike);
  mocks.getCarById.mockReset().mockResolvedValue(null);
  mocks.materializeAllDueForBike.mockReset().mockResolvedValue(undefined);
  mocks.materializeAllDueForCar.mockReset().mockResolvedValue(undefined);
  mocks.getExchangeRates.mockReset().mockResolvedValue(null);
  mocks.getProStatus.mockReset().mockResolvedValue({ isPro: false });

  mocks.bike.records.mockResolvedValue([{ id: "s1", date: "2026-09-12", cost: 120, mileage: 35000, jobType: "full-service" }]);
  mocks.bike.fuel.mockResolvedValue([
    { id: "f1", date: "2026-08-01", cost: 20, litres: 12, filledToFull: true, mileage: 34800 },
    { id: "f2", date: "2026-09-10", cost: 22, litres: 12, filledToFull: true, mileage: 34980 },
  ]);
  mocks.bike.mods.mockResolvedValue([{ id: "m1", date: "2025-06-01", cost: 200, mileage: 30000, name: "Can" }]);
  mocks.bike.bills.mockResolvedValue([{ id: "b1", date: "2026-03-01", cost: 100, billType: "insurance" }]);
  mocks.bike.labour.mockResolvedValue([{ id: "l1", date: "2026-09-15", cost: 50, mileage: 35150, category: "chain-adjust" }]);
});

describe("getReports", () => {
  it("returns null for a vehicle that isn't on this account", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getReports(email, "bike", "not-mine", "all", NOW)).toBeNull();
  });

  it("gives a free account the free figures only - no Pro numbers", async () => {
    const r = (await getReports(email, "bike", "bike-1", "all", NOW))!;
    expect(r.isPro).toBe(false);
    expect(r.stats).toEqual({ totalSpend: "£512.00", currentMileage: "35,200 miles", economy: null, perDistance: null, yearSpend: null });
    expect(r.breakdown).toBeNull();
    expect(r.economySeries).toBeNull();
    expect(r.fuelCosts).toBeNull();
    expect(r.monthly).toBeNull();
    expect(r.mileage.length).toBeGreaterThan(0);
  });

  it("gives Pro the breakdown, per-mile cost, economy and this year's spend", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: true });
    const r = (await getReports(email, "bike", "bike-1", "all", NOW))!;
    expect(r.breakdown!.map((b) => [b.key, b.amountLabel])).toEqual([
      ["mods", "£200.00"],
      ["service", "£120.00"],
      ["bills", "£100.00"],
      ["labour", "£50.00"],
      ["fuel", "£42.00"],
    ]);
    // 512 over 35,200 - 29,000 = 6,200 miles.
    expect(r.stats.perDistance).toBe(`${((512 / 6200) * 100).toFixed(1)}p`);
    // Everything but last year's can.
    expect(r.stats.yearSpend).toBe("£312.00");
    expect(r.stats.economy).toMatch(/mpg/);
    expect(r.economySeries).toHaveLength(1);
    expect(r.fuelCosts!.map((f) => f.value)).toEqual([20, 22]);
  });

  it("works each figure out over the chosen range only", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: true });
    const r = (await getReports(email, "bike", "bike-1", "1m", NOW))!;
    expect(r.stats.totalSpend).toBe("£192.00");
    expect(r.breakdown!.map((b) => b.key).sort()).toEqual(["fuel", "labour", "service"]);
    expect(r.monthly!.map((m) => m.month)).toEqual(["2026-09"]);
    expect(r.monthly![0].values).toEqual({ service: 120, mods: 0, fuel: 22, bills: 0, labour: 50 });
  });

  it("buckets spend by calendar month, oldest first", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: true });
    const r = (await getReports(email, "bike", "bike-1", "all", NOW))!;
    expect(r.monthly!.map((m) => m.month)).toEqual(["2025-06", "2026-03", "2026-08", "2026-09"]);
    expect(r.monthly![0].label).toBe("Jun 2025");
  });

  it("counts an electric car's charging in its spend, with no economy figure", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: true });
    mocks.getCarById.mockResolvedValue({ id: "car-1", make: "BMW", model: "i4", currentMileage: 100, startingMileage: 50, fuelType: "electric" });
    mocks.car.fuel.mockResolvedValue([{ id: "c1", date: "2026-09-20", cost: 12, fuelType: "electric", kwh: 40, mileage: 100 }]);
    const r = (await getReports(email, "car", "car-1", "all", NOW))!;
    expect(r.electric).toBe(true);
    expect(r.stats.totalSpend).toBe("£12.00");
    expect(r.stats.economy).toBe("-");
    expect(r.economySeries).toEqual([]);
  });

  it("gives distances in the vehicle's own unit", async () => {
    mocks.getBike.mockResolvedValue({ ...bike, distanceUnit: "km" });
    const r = (await getReports(email, "bike", "bike-1", "all", NOW))!;
    expect(r.stats.currentMileage).toBe(`${Math.round(35200 * 1.60934).toLocaleString("en-GB")} km`);
  });
});
