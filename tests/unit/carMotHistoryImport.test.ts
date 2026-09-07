// Place at: tests/unit/carMotHistoryImport.test.ts
//
// Mirrors tests/unit/motHistoryImport.test.ts exactly - same behaviour,
// car-shaped doc types and functions.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMotHistoryFromVdg: vi.fn(),
  getCarBills: vi.fn(),
  createCarBill: vi.fn(),
  createCarReminder: vi.fn(),
  deleteCarRemindersBySourceKey: vi.fn(),
  isBeforeProduction: vi.fn(),
  motReminderDate: vi.fn(),
  reestimateCarFuelMileage: vi.fn(),
}));

vi.mock("@/lib/tracker/motHistoryFetch", () => ({
  fetchMotHistoryFromVdg: mocks.fetchMotHistoryFromVdg,
}));
vi.mock("@/lib/tracker/carBill", () => ({
  getCarBills: mocks.getCarBills,
  createCarBill: mocks.createCarBill,
}));
vi.mock("@/lib/tracker/carReminder", () => ({
  createCarReminder: mocks.createCarReminder,
  deleteCarRemindersBySourceKey: mocks.deleteCarRemindersBySourceKey,
}));
vi.mock("@/lib/tracker/productionYearCheck", () => ({
  isBeforeProduction: mocks.isBeforeProduction,
}));
vi.mock("@/lib/tracker/motHistory", () => ({
  motReminderDate: mocks.motReminderDate,
}));
vi.mock("@/lib/tracker/reestimateCarFuelMileage", () => ({
  reestimateCarFuelMileage: mocks.reestimateCarFuelMileage,
}));

import { importMotHistoryForCar } from "@/lib/tracker/carMotHistoryImport";

const email = "driver@example.com";
const car = { id: "car-1", year: 2019 } as any;

const passedTest = {
  testDate: "2025-01-15T00:00:00.000Z",
  passed: true,
  mileage: 12000,
  mileageTrusted: true,
  notes: "Passed",
};

const failedTest = {
  testDate: "2024-06-01T00:00:00.000Z",
  passed: false,
  mileage: 9000,
  mileageTrusted: true,
  notes: "Failed - worn tyres",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchMotHistoryFromVdg.mockResolvedValue({
    motDueDate: "2026-01-15",
    tests: [passedTest],
  });
  mocks.getCarBills.mockResolvedValue([]);
  mocks.createCarBill.mockResolvedValue(undefined);
  mocks.createCarReminder.mockResolvedValue(undefined);
  mocks.deleteCarRemindersBySourceKey.mockResolvedValue(undefined);
  mocks.isBeforeProduction.mockReturnValue(false);
  mocks.motReminderDate.mockReturnValue("2025-12-16");
  mocks.reestimateCarFuelMileage.mockResolvedValue({ updatedCount: 0 });
});

describe("importMotHistoryForCar", () => {
  it("returns a 404 error object when fetchMotHistoryFromVdg returns null", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue(null);
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(result).toMatchObject({ error: expect.any(String), status: 404 });
    expect(mocks.createCarBill).not.toHaveBeenCalled();
  });

  it("creates a bill entry for each new MOT test", async () => {
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.createCarBill).toHaveBeenCalledOnce();
    expect(mocks.createCarBill).toHaveBeenCalledWith(email, expect.objectContaining({
      carId: "car-1",
      billType: "mot-test",
      date: passedTest.testDate,
      mileage: 12000,
    }));
  });

  it("returns correct createdCount and skippedCount on a clean import", async () => {
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 0, skipped: [] });
  });

  it("passes the vrm to fetchMotHistoryFromVdg", async () => {
    await importMotHistoryForCar(email, car, "XY99ZZZ");
    expect(mocks.fetchMotHistoryFromVdg).toHaveBeenCalledWith("XY99ZZZ");
  });

  it("skips a test whose date is already logged as an mot-test bill", async () => {
    mocks.getCarBills.mockResolvedValue([
      { billType: "mot-test", date: "2025-01-15T00:00:00.000Z" },
    ]);
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.createCarBill).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
      skipped: [{ date: "2025-01-15", reason: "Already logged." }],
    });
  });

  it("does not skip a test just because a non-MOT bill exists on the same date", async () => {
    mocks.getCarBills.mockResolvedValue([
      { billType: "insurance", date: "2025-01-15T00:00:00.000Z" },
    ]);
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.createCarBill).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 0 });
  });

  it("skips a test that isBeforeProduction returns true for", async () => {
    mocks.isBeforeProduction.mockReturnValue(true);
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.createCarBill).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
      skipped: [{ date: "2025-01-15", reason: expect.stringContaining("production year") }],
    });
  });

  it("passes each test and the car to isBeforeProduction", async () => {
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.isBeforeProduction).toHaveBeenCalledWith(passedTest.testDate, car);
  });

  it("processes multiple tests independently — create some, skip others", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue({
      motDueDate: "2026-01-15",
      tests: [failedTest, passedTest],
    });
    mocks.getCarBills.mockResolvedValue([
      { billType: "mot-test", date: "2024-06-01T00:00:00.000Z" },
    ]);
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 1 });
    expect(mocks.createCarBill).toHaveBeenCalledOnce();
  });

  it("sets a reminder and returns reminderSet:true when motDueDate is present", async () => {
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(result).toMatchObject({ reminderSet: true, motDueDate: "2026-01-15" });
    expect(mocks.deleteCarRemindersBySourceKey).toHaveBeenCalledWith(
      email, "car-1", "bill:mot-test"
    );
    expect(mocks.createCarReminder).toHaveBeenCalledWith(email, expect.objectContaining({
      carId: "car-1",
      name: "MOT renewal",
      intervalType: "date",
      sourceKey: "bill:mot-test",
    }));
  });

  it("uses motReminderDate to calculate the reminder's exactDate", async () => {
    mocks.motReminderDate.mockReturnValue("2025-12-16");
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.motReminderDate).toHaveBeenCalledWith("2026-01-15");
    expect(mocks.createCarReminder).toHaveBeenCalledWith(email, expect.objectContaining({
      exactDate: "2025-12-16",
    }));
  });

  it("deletes the existing reminder before creating the new one", async () => {
    const callOrder: string[] = [];
    mocks.deleteCarRemindersBySourceKey.mockImplementation(() => {
      callOrder.push("delete");
      return Promise.resolve();
    });
    mocks.createCarReminder.mockImplementation(() => {
      callOrder.push("create");
      return Promise.resolve();
    });
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(callOrder).toEqual(["delete", "create"]);
  });

  it("returns reminderSet:false and does not create a reminder when motDueDate is null", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue({
      motDueDate: null,
      tests: [passedTest],
    });
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(result).toMatchObject({ reminderSet: false });
    expect(mocks.createCarReminder).not.toHaveBeenCalled();
    expect(mocks.deleteCarRemindersBySourceKey).not.toHaveBeenCalled();
  });

  it("calls reestimateCarFuelMileage when at least one test was created", async () => {
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.reestimateCarFuelMileage).toHaveBeenCalledWith(email, car);
  });

  it("does not call reestimateCarFuelMileage when no tests were created", async () => {
    mocks.getCarBills.mockResolvedValue([
      { billType: "mot-test", date: "2025-01-15T00:00:00.000Z" },
    ]);
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.reestimateCarFuelMileage).not.toHaveBeenCalled();
  });

  it("still returns success if reestimateCarFuelMileage throws", async () => {
    mocks.reestimateCarFuelMileage.mockRejectedValue(new Error("re-estimate failed"));
    const result = await importMotHistoryForCar(email, car, "AB12CDE");
    expect(result).toMatchObject({ createdCount: 1 });
  });

  it("always creates bills with cost 0 regardless of any test data", async () => {
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.createCarBill).toHaveBeenCalledWith(email, expect.objectContaining({ cost: 0 }));
  });

  it("omits mileage from the bill when the test has no mileage", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue({
      motDueDate: "2026-01-15",
      tests: [{ ...passedTest, mileage: null }],
    });
    await importMotHistoryForCar(email, car, "AB12CDE");
    expect(mocks.createCarBill).toHaveBeenCalledWith(email, expect.objectContaining({
      mileage: undefined,
    }));
  });
});
