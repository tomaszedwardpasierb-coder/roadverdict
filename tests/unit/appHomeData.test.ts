import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBike: vi.fn(),
  getCarById: vi.fn(),
  getBikesForUser: vi.fn(),
  getCarsForUser: vi.fn(),
  resolveActiveVehicle: vi.fn(),
  materializeAllDueForBike: vi.fn(),
  materializeAllDueForCar: vi.fn(),
  bike: {
    records: vi.fn(), fuel: vi.fn(), mods: vi.fn(), bills: vi.fn(), labour: vi.fn(), reminders: vi.fn(),
  },
  car: {
    records: vi.fn(), fuel: vi.fn(), mods: vi.fn(), bills: vi.fn(), labour: vi.fn(), reminders: vi.fn(),
  },
  getExchangeRates: vi.fn(),
  getProStatus: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getBikesForUser: mocks.getBikesForUser,
  getCurrentRegistration: (b: { registration?: string }) => b.registration,
  isBikeReadOnly: (b: { transferredAt?: string }) => !!b.transferredAt,
}));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getCarsForUser: mocks.getCarsForUser,
  getCurrentRegistration: (c: { registration?: string }) => c.registration,
  isCarReadOnly: (c: { transferredAt?: string }) => !!c.transferredAt,
}));
vi.mock("@/lib/tracker/activeVehicle", () => ({ resolveActiveVehicle: mocks.resolveActiveVehicle }));
vi.mock("@/lib/tracker/billSeries", () => ({ materializeAllDueForBike: mocks.materializeAllDueForBike }));
vi.mock("@/lib/tracker/carBillSeries", () => ({ materializeAllDueForCar: mocks.materializeAllDueForCar }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.bike.records }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.bike.fuel }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.bike.mods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.bike.bills }));
vi.mock("@/lib/tracker/labour", () => ({ getLabour: mocks.bike.labour }));
vi.mock("@/lib/tracker/reminder", async () => {
  const status = await import("@/lib/tracker/reminderStatus");
  return { getReminders: mocks.bike.reminders, computeReminderStatus: status.computeReminderStatus, reminderDetailLabel: status.reminderDetailLabel };
});
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.car.records }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.car.fuel }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.car.mods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.car.bills }));
vi.mock("@/lib/tracker/carLabour", () => ({ getCarLabour: mocks.car.labour }));
vi.mock("@/lib/tracker/carReminder", () => ({ getCarReminders: mocks.car.reminders }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));
vi.mock("@/lib/subscriptions", () => ({ getProStatus: mocks.getProStatus }));

import { getHomeData, getGarage } from "@/lib/app/homeData";

const email = "rider@example.com";
const NOW = new Date("2026-09-25T12:00:00Z");
const bike = { id: "bike-1", make: "Yamaha", model: "MT-07", nickname: "Blue", registration: "YA16 MTO", currentMileage: 35621 };

function inDays(days: number): string {
  return new Date(NOW.getTime() + days * 86400000).toISOString();
}

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
});

describe("getHomeData", () => {
  it("returns null for a vehicle that isn't on this account", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getHomeData(email, "bike", "someone-elses-bike", NOW)).toBeNull();
    expect(mocks.getBike).toHaveBeenCalledWith(email, "someone-elses-bike");
  });

  it("totals this month and this year across the same five categories as the web", async () => {
    mocks.bike.fuel.mockResolvedValue([{ id: "f1", date: "2026-09-23", cost: 19.8, litres: 12.4, filledToFull: true, mileage: 35621 }]);
    mocks.bike.records.mockResolvedValue([{ id: "s1", date: "2026-09-14", cost: 137.47, jobType: "oil-change", mileage: 35410 }]);
    mocks.bike.bills.mockResolvedValue([{ id: "b1", date: "2026-03-01", cost: 312, billType: "insurance" }]);
    mocks.bike.mods.mockResolvedValue([{ id: "m1", date: "2025-12-01", cost: 99, name: "Last year's part", mileage: 30000 }]);

    const home = (await getHomeData(email, "bike", "bike-1", NOW))!;

    expect(home.spend.monthTotalLabel).toBe("£157.27");
    expect(home.spend.yearTotalLabel).toBe("£469.27");
    expect(home.spend.monthName).toBe("September");
  });

  it("lists only reminders needing attention, overdue first", async () => {
    mocks.bike.reminders.mockResolvedValue([
      { id: "r-ok", name: "Road tax", intervalType: "date", exactDate: inDays(90), date: "2026-01-01" },
      { id: "r-soon", name: "MOT", intervalType: "date", exactDate: inDays(10), date: "2026-01-01" },
      { id: "r-over", name: "Chain", intervalType: "date", exactDate: inDays(-2), date: "2026-01-01" },
    ]);

    const home = (await getHomeData(email, "bike", "bike-1", NOW))!;

    expect(home.dueSoon.map((r) => [r.id, r.status])).toEqual([["r-over", "overdue"], ["r-soon", "due-soon"]]);
    expect(home.reminderCounts).toEqual({ overdue: 1, dueSoon: 1, ok: 1 });
  });

  it("withholds the exact due detail from free accounts, like the web", async () => {
    mocks.bike.reminders.mockResolvedValue([{ id: "r1", name: "MOT", intervalType: "date", exactDate: inDays(10), date: "2026-01-01" }]);

    const free = (await getHomeData(email, "bike", "bike-1", NOW))!;
    expect(free.dueSoon[0].detail).toBeNull();

    mocks.getProStatus.mockResolvedValue({ isPro: true });
    const pro = (await getHomeData(email, "bike", "bike-1", NOW))!;
    expect(pro.dueSoon[0].detail).toMatch(/^due /);
  });

  it("always shows a permanent (SORN) reminder's explanation, even on a free account", async () => {
    mocks.bike.reminders.mockResolvedValue([{ id: "sorn", name: "Vehicle is SORN (not taxed)", intervalType: "permanent", date: "2026-01-01" }]);
    const home = (await getHomeData(email, "bike", "bike-1", NOW))!;
    expect(home.dueSoon[0]).toMatchObject({ status: "overdue", detail: expect.stringContaining("taxed again") });
  });

  it("returns the five most recent entries, newest first, with units applied", async () => {
    mocks.getBike.mockResolvedValue({ ...bike, distanceUnit: "km" });
    mocks.bike.fuel.mockResolvedValue(
      Array.from({ length: 7 }, (_, i) => ({ id: `f${i}`, date: `2026-09-0${i + 1}`, cost: 10, litres: 10, filledToFull: false, mileage: 1000 }))
    );

    const home = (await getHomeData(email, "bike", "bike-1", NOW))!;

    expect(home.recent.map((r) => r.id)).toEqual(["f6", "f5", "f4", "f3", "f2"]);
    expect(home.recent[0]).toMatchObject({ category: "fuel", description: "10.0 L", costLabel: "£10.00", mileageLabel: "1,609 km" });
    expect(home.vehicle).toMatchObject({ name: "Blue", makeModel: "Yamaha MT-07", registration: "YA16 MTO", mileageLabel: "57,326 km" });
  });

  it("writes due instalments first for an owned vehicle, but never for a transferred one", async () => {
    await getHomeData(email, "bike", "bike-1", NOW);
    expect(mocks.materializeAllDueForBike).toHaveBeenCalledWith(email, "bike-1");

    mocks.materializeAllDueForBike.mockClear();
    mocks.getBike.mockResolvedValue({ ...bike, transferredAt: "2026-01-01" });
    await getHomeData(email, "bike", "bike-1", NOW);
    expect(mocks.materializeAllDueForBike).not.toHaveBeenCalled();
  });

  it("describes an electric car's charging session in kWh", async () => {
    mocks.getCarById.mockResolvedValue({ id: "car-1", make: "BMW", model: "i4", currentMileage: 1000 });
    mocks.car.fuel.mockResolvedValue([{ id: "c1", date: "2026-09-20", cost: 12, fuelType: "electric", kwh: 40.5, mileage: 1000 }]);

    const home = (await getHomeData(email, "car", "car-1", NOW))!;

    expect(home.vehicle.kind).toBe("car");
    expect(home.recent[0].description).toBe("40.5 kWh");
  });
});

describe("getGarage", () => {
  it("lists bikes then cars, with the web's default vehicle", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", make: "BMW", model: "640i Gran Coupe", registration: "AB12 CDE" }]);
    mocks.resolveActiveVehicle.mockResolvedValue({ kind: "car", car: { id: "car-1" } });

    const garage = await getGarage(email);

    expect(garage.vehicles.map((v) => [v.kind, v.id, v.name])).toEqual([
      ["bike", "bike-1", "Blue"],
      ["car", "car-1", "BMW 640i Gran Coupe"],
    ]);
    expect(garage.defaultVehicle).toEqual({ kind: "car", id: "car-1" });
  });

  it("has no default for an empty garage", async () => {
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([]);
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect(await getGarage(email)).toEqual({ vehicles: [], defaultVehicle: null });
  });
});
