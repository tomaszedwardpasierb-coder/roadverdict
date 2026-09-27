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
    records: vi.fn(), fuel: vi.fn(), mods: vi.fn(), bills: vi.fn(), labour: vi.fn(), fines: vi.fn(), tolls: vi.fn(), reminders: vi.fn(),
  },
  car: {
    records: vi.fn(), fuel: vi.fn(), mods: vi.fn(), bills: vi.fn(), labour: vi.fn(), fines: vi.fn(), tolls: vi.fn(), reminders: vi.fn(),
  },
  getExchangeRates: vi.fn(),
  getProStatus: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getBikesForUser: mocks.getBikesForUser,
  getCurrentRegistration: (b: { registration?: string }) => b.registration,
  isBikeReadOnly: (b: { transferredAt?: string }) => !!b.transferredAt,
  countActiveBikes: (bikes: { transferredAt?: string }[]) => bikes.filter((b) => !b.transferredAt).length,
}));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getCarsForUser: mocks.getCarsForUser,
  getCurrentRegistration: (c: { registration?: string }) => c.registration,
  isCarReadOnly: (c: { transferredAt?: string }) => !!c.transferredAt,
  countActiveCars: (cars: { transferredAt?: string }[]) => cars.filter((c) => !c.transferredAt).length,
}));
vi.mock("@/lib/tracker/activeVehicle", () => ({ resolveActiveVehicle: mocks.resolveActiveVehicle }));
vi.mock("@/lib/tracker/billSeries", () => ({ materializeAllDueForBike: mocks.materializeAllDueForBike }));
vi.mock("@/lib/tracker/carBillSeries", () => ({ materializeAllDueForCar: mocks.materializeAllDueForCar }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.bike.records }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.bike.fuel }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.bike.mods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.bike.bills }));
vi.mock("@/lib/tracker/labour", () => ({ getLabour: mocks.bike.labour }));
vi.mock("@/lib/tracker/fine", () => ({ getFines: mocks.bike.fines }));
vi.mock("@/lib/tracker/toll", () => ({ getTolls: mocks.bike.tolls }));
vi.mock("@/lib/tracker/reminder", async () => {
  const status = await import("@/lib/tracker/reminderStatus");
  return { getReminders: mocks.bike.reminders, computeReminderStatus: status.computeReminderStatus, reminderDetailLabel: status.reminderDetailLabel };
});
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.car.records }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.car.fuel }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.car.mods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.car.bills }));
vi.mock("@/lib/tracker/carLabour", () => ({ getCarLabour: mocks.car.labour }));
vi.mock("@/lib/tracker/carFine", () => ({ getCarFines: mocks.car.fines }));
vi.mock("@/lib/tracker/carToll", () => ({ getCarTolls: mocks.car.tolls }));
vi.mock("@/lib/tracker/carReminder", () => ({ getCarReminders: mocks.car.reminders }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));
vi.mock("@/lib/subscriptions", () => ({ getProStatus: mocks.getProStatus }));

import { getEntryDetail, getHomeData, getGarage, getLogbook, getMileageEstimate, getReminderList } from "@/lib/app/homeData";

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
    expect(await getGarage(email)).toEqual({ vehicles: [], defaultVehicle: null, vehicleLimit: { limit: 1, active: 0 } });
  });

  it("gives the free plan's vehicle limit, counting only vehicles still owned, bikes and cars together", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike, { ...bike, id: "bike-2", transferredAt: "2026-05-01" }]);
    mocks.getCarsForUser.mockResolvedValue([]);
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect((await getGarage(email)).vehicleLimit).toEqual({ limit: 1, active: 1 });
  });

  it("gives Pro its higher limit", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: true });
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", make: "BMW", model: "i4", currentMileage: 100 }]);
    mocks.resolveActiveVehicle.mockResolvedValue(null);
    expect((await getGarage(email)).vehicleLimit).toEqual({ limit: 2, active: 2 });
  });
});

describe("getLogbook", () => {
  it("returns null for a vehicle that isn't on this account", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getLogbook(email, "bike", "not-mine")).toBeNull();
  });

  it("lists every category newest first, with counts for the filter chips", async () => {
    mocks.bike.fuel.mockResolvedValue([{ id: "f1", date: "2026-09-23", cost: 19.8, litres: 12.4, filledToFull: true, mileage: 35621 }]);
    mocks.bike.fines.mockResolvedValue([{ id: "fi1", date: "2026-09-24", cost: 70, fineType: "parking" }]);
    mocks.bike.tolls.mockResolvedValue([{ id: "t1", date: "2026-08-01", cost: 7.5, tollType: "bridge" }]);
    mocks.bike.mods.mockResolvedValue([{ id: "m1", date: "2026-09-02", cost: 149, name: "Chain kit", mileage: 35102, needsReview: true, attachments: [{}, {}] }]);

    const log = (await getLogbook(email, "bike", "bike-1"))!;

    expect(log.entries.map((e) => [e.category, e.id])).toEqual([
      ["fines", "fi1"],
      ["fuel", "f1"],
      ["mods", "m1"],
      ["tolls", "t1"],
    ]);
    expect(log.counts).toEqual({ fuel: 1, service: 0, mods: 1, bills: 0, labour: 0, fines: 1, tolls: 1 });
    expect(log.entries.find((e) => e.id === "m1")).toMatchObject({ needsReview: true, attachmentCount: 2, costLabel: "£149.00" });
    expect(log.entries.find((e) => e.id === "fi1")).toMatchObject({ needsReview: false, attachmentCount: 0, mileageLabel: null });
  });

  it("keeps fines and tolls out of Home's spend and recent list, like the web", async () => {
    mocks.bike.fines.mockResolvedValue([{ id: "fi1", date: "2026-09-24", cost: 70, fineType: "parking" }]);
    mocks.bike.tolls.mockResolvedValue([{ id: "t1", date: "2026-09-20", cost: 7.5, tollType: "bridge" }]);

    const home = (await getHomeData(email, "bike", "bike-1", NOW))!;

    expect(home.spend.monthTotalLabel).toBe("£0.00");
    expect(home.recent).toEqual([]);
  });
});

describe("getEntryDetail", () => {
  it("returns null for a vehicle that isn't on this account", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getEntryDetail(email, "bike", "not-mine", "fuel", "f1")).toBeNull();
    expect(mocks.bike.fuel).not.toHaveBeenCalled();
  });

  it("only finds an entry among that vehicle's own records of that category", async () => {
    mocks.bike.fuel.mockResolvedValue([{ id: "f1", date: "2026-09-23", cost: 19.8, litres: 12.4, filledToFull: true, mileage: 35621 }]);
    expect(await getEntryDetail(email, "bike", "bike-1", "fuel", "someone-elses")).toBeNull();
    expect(await getEntryDetail(email, "bike", "bike-1", "service", "f1")).toBeNull();
    expect(mocks.bike.fuel).toHaveBeenCalledWith(email, "bike-1");
  });

  it("gives a service in full: the job key for the form, stored and display values, and receipts", async () => {
    mocks.getExchangeRates.mockResolvedValue({ base: "GBP", rates: { EUR: 1.2 }, fetchedAt: "2026-09-25" });
    mocks.getBike.mockResolvedValue({ ...bike, currency: "EUR", distanceUnit: "km" });
    mocks.bike.records.mockResolvedValue([
      {
        id: "rider@example.com::service::1",
        date: "2026-09-01",
        cost: 100,
        jobType: "full-service",
        mileage: 35000,
        notes: "Main dealer",
        needsReview: true,
        mileageConfidence: "estimated",
        attachments: [{ blobName: "rider/abc 1.jpg", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-09-01" }],
      },
    ]);

    const detail = (await getEntryDetail(email, "bike", "bike-1", "service", "rider@example.com::service::1"))!;

    expect(detail.vehicle).toMatchObject({ kind: "bike", id: "bike-1" });
    expect(detail.entry).toMatchObject({
      category: "service",
      type: "Service",
      description: "Full service",
      typeKey: "full-service",
      name: null,
      notes: "Main dealer",
      costGbp: 100,
      costDisplay: 120,
      mileageMiles: 35000,
      mileageDisplay: 56327,
      mileageEstimated: true,
      needsReview: true,
      fuel: null,
      instalmentPlan: false,
    });
    expect(detail.entry.attachments).toEqual([
      { fileName: "receipt.jpg", fileType: "image/jpeg", path: "/api/tracker/attachment/rider%2Fabc%201.jpg" },
    ]);
  });

  it("gives a part's own type as its form key, not the logbook category", async () => {
    mocks.bike.mods.mockResolvedValue([{ id: "m1", date: "2026-09-02", cost: 149, category: "exhaust", name: "Slip-on can", mileage: 35102, notes: "" }]);
    const detail = (await getEntryDetail(email, "bike", "bike-1", "mods", "m1"))!;
    expect(detail.entry).toMatchObject({ category: "mods", typeKey: "exhaust", name: "Slip-on can", description: "Slip-on can" });
  });

  it("gives a bike's fill-up in litres, with whether the tank was filled", async () => {
    mocks.bike.fuel.mockResolvedValue([{ id: "f1", date: "2026-09-23", cost: 19.8, litres: 12.4, filledToFull: true, mileage: 35621 }]);
    const detail = (await getEntryDetail(email, "bike", "bike-1", "fuel", "f1"))!;
    expect(detail.entry).toMatchObject({ typeKey: null, mileageEstimated: false, fuel: { amount: 12.4, unit: "L", filledToFull: true } });
  });

  it("describes an electric car's charge in kWh, never as a full tank", async () => {
    mocks.getCarById.mockResolvedValue({ id: "car-1", make: "BMW", model: "i4", currentMileage: 100, fuelType: "electric" });
    mocks.car.fuel.mockResolvedValue([{ id: "c1", date: "2026-09-20", cost: 12.5, fuelType: "electric", kwh: 40.5, filledToFull: true, mileage: 90 }]);
    const detail = (await getEntryDetail(email, "car", "car-1", "fuel", "c1"))!;
    expect(detail.vehicle).toMatchObject({ kind: "car", id: "car-1" });
    expect(detail.entry).toMatchObject({ description: "40.5 kWh", fuel: { amount: 40.5, unit: "kWh", filledToFull: false } });
  });

  it("flags a bill written by an instalment plan", async () => {
    mocks.bike.bills.mockResolvedValue([{ id: "b1", date: "2026-09-01", cost: 45, billType: "insurance", notes: "", seriesId: "s1" }]);
    const detail = (await getEntryDetail(email, "bike", "bike-1", "bills", "b1"))!;
    expect(detail.entry).toMatchObject({ typeKey: "insurance", instalmentPlan: true, mileageMiles: null, mileageDisplay: null, attachments: [] });
  });

  it("is a read only - it never writes due instalments", async () => {
    await getEntryDetail(email, "bike", "bike-1", "bills", "b1");
    expect(mocks.materializeAllDueForBike).not.toHaveBeenCalled();
  });
});

describe("vehicle units for the app's forms", () => {
  it("gives the rate and km factor the app needs to convert input like the web forms do", async () => {
    mocks.getExchangeRates.mockResolvedValue({ base: "GBP", rates: { EUR: 1.2 }, fetchedAt: "2026-09-25" });
    mocks.getBikesForUser.mockResolvedValue([{ ...bike, currency: "EUR", distanceUnit: "km" }]);
    mocks.getCarsForUser.mockResolvedValue([{ id: "car-1", make: "BMW", model: "i4", currentMileage: 100, fuelType: "electric" }]);
    mocks.resolveActiveVehicle.mockResolvedValue(null);

    const { vehicles } = await getGarage(email);

    expect(vehicles[0]).toMatchObject({
      fuelType: null,
      units: { distanceUnit: "km", currency: "EUR", currencySymbol: "€", rateFromGbp: 1.2, currentMileageDisplay: 57326 },
    });
    expect(vehicles[0].units.kmPerMile).toBeCloseTo(1.60934);
    expect(vehicles[1]).toMatchObject({ fuelType: "electric", units: { currency: "GBP", rateFromGbp: 1, distanceUnit: "mi", currentMileageDisplay: 100 } });
  });
});

describe("getMileageEstimate", () => {
  const owned = { ...bike, startingMileage: 30000, currentMileage: 36000, dateAdded: "2026-01-01" };

  beforeEach(() => mocks.getBike.mockResolvedValue(owned));

  it("uses the current mileage for today, with no note", async () => {
    expect(await getMileageEstimate(email, "bike", "bike-1", "2026-09-25")).toEqual({ mileageDisplay: 36000, note: null });
  });

  it("interpolates a past date between two logged entries", async () => {
    mocks.bike.fuel.mockResolvedValue([
      { id: "f1", date: "2026-09-01", cost: 10, litres: 10, filledToFull: false, mileage: 35000 },
      { id: "f2", date: "2026-09-21", cost: 10, litres: 10, filledToFull: false, mileage: 35200 },
    ]);

    const estimate = (await getMileageEstimate(email, "bike", "bike-1", "2026-09-11"))!;

    expect(estimate.mileageDisplay).toBe(35100);
    expect(estimate.note).toMatch(/interpolated between logged records/);
  });

  it("gives the estimate in the vehicle's own unit", async () => {
    mocks.getBike.mockResolvedValue({ ...owned, distanceUnit: "km" });
    expect((await getMileageEstimate(email, "bike", "bike-1", "2026-09-25"))!.mileageDisplay).toBe(57936);
  });

  it("returns null for a vehicle that isn't on this account", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getMileageEstimate(email, "bike", "not-mine", "2026-09-01")).toBeNull();
  });

  it("never writes due instalments - an estimate is read-only", async () => {
    await getMileageEstimate(email, "bike", "bike-1", "2026-09-01");
    expect(mocks.materializeAllDueForBike).not.toHaveBeenCalled();
  });
});

describe("getReminderList", () => {
  it("lists every reminder, most urgent first, flagging SORN and one-off date reminders", async () => {
    mocks.bike.reminders.mockResolvedValue([
      { id: "r-tax", name: "Road tax", intervalType: "date", exactDate: inDays(90), date: "2026-01-01" },
      { id: "r-mot", name: "MOT", intervalType: "date", exactDate: inDays(10), date: "2026-01-01" },
      { id: "r-sorn", name: "Vehicle is SORN (not taxed)", intervalType: "permanent", date: "2026-01-01" },
      { id: "r-oil", name: "Oil change", intervalType: "mileage", intervalValue: 4000, baseMileage: 34000, date: "2026-01-01" },
    ]);

    const list = (await getReminderList(email, "bike", "bike-1"))!;

    expect(list.reminders.map((r) => [r.id, r.status])).toEqual([
      ["r-sorn", "overdue"],
      ["r-mot", "due-soon"],
      ["r-oil", "ok"],
      ["r-tax", "ok"],
    ]);
    expect(list.reminders.find((r) => r.id === "r-sorn")).toMatchObject({ permanent: true, oneOff: false, detail: expect.stringContaining("taxed again") });
    expect(list.reminders.find((r) => r.id === "r-mot")).toMatchObject({ permanent: false, oneOff: true, detail: null });
    expect(list.isPro).toBe(false);
  });

  it("shows exact due details to Pro accounts", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: true });
    mocks.bike.reminders.mockResolvedValue([{ id: "r-mot", name: "MOT", intervalType: "date", exactDate: inDays(10), date: "2026-01-01" }]);
    const list = (await getReminderList(email, "bike", "bike-1"))!;
    expect(list.reminders[0].detail).toMatch(/^due /);
  });

  it("returns null for a vehicle that isn't on this account", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getReminderList(email, "bike", "not-mine")).toBeNull();
  });
});
