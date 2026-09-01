import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchMotHistoryFromVdg: vi.fn(),
  getBills: vi.fn(),
  createBill: vi.fn(),
  createReminder: vi.fn(),
  deleteRemindersBySourceKey: vi.fn(),
  isBeforeProduction: vi.fn(),
  motReminderDate: vi.fn(),
  reestimateFuelMileage: vi.fn(),
}));

vi.mock("@/lib/tracker/motHistoryFetch", () => ({
  fetchMotHistoryFromVdg: mocks.fetchMotHistoryFromVdg,
}));
vi.mock("@/lib/tracker/bill", () => ({
  getBills: mocks.getBills,
  createBill: mocks.createBill,
}));
vi.mock("@/lib/tracker/reminder", () => ({
  createReminder: mocks.createReminder,
  deleteRemindersBySourceKey: mocks.deleteRemindersBySourceKey,
}));
vi.mock("@/lib/tracker/productionYearCheck", () => ({
  isBeforeProduction: mocks.isBeforeProduction,
}));
vi.mock("@/lib/tracker/motHistory", () => ({
  motReminderDate: mocks.motReminderDate,
}));
vi.mock("@/lib/tracker/reestimateFuelMileage", () => ({
  reestimateFuelMileage: mocks.reestimateFuelMileage,
}));

import { importMotHistoryForBike } from "@/lib/tracker/motHistoryImport";

const email = "rider@example.com";
const bike = { id: "bike-1", year: 2019 } as any;

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
  notes: "Failed - worn pads",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.fetchMotHistoryFromVdg.mockResolvedValue({
    motDueDate: "2026-01-15",
    tests: [passedTest],
  });
  mocks.getBills.mockResolvedValue([]);
  mocks.createBill.mockResolvedValue(undefined);
  mocks.createReminder.mockResolvedValue(undefined);
  mocks.deleteRemindersBySourceKey.mockResolvedValue(undefined);
  mocks.isBeforeProduction.mockReturnValue(false);
  mocks.motReminderDate.mockReturnValue("2025-12-16");
  mocks.reestimateFuelMileage.mockResolvedValue({ updatedCount: 0 });
});

describe("importMotHistoryForBike", () => {
  // ── VDG fetch failure ───────────────────────────────────────────────────

  it("returns a 404 error object when fetchMotHistoryFromVdg returns null", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue(null);
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(result).toMatchObject({ error: expect.any(String), status: 404 });
    expect(mocks.createBill).not.toHaveBeenCalled();
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("creates a bill entry for each new MOT test", async () => {
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).toHaveBeenCalledOnce();
    expect(mocks.createBill).toHaveBeenCalledWith(email, expect.objectContaining({
      bikeId: "bike-1",
      billType: "mot-test",
      date: passedTest.testDate,
      mileage: 12000,
    }));
  });

  it("returns correct createdCount and skippedCount on a clean import", async () => {
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 0, skipped: [] });
  });

  it("passes the vrm to fetchMotHistoryFromVdg", async () => {
    await importMotHistoryForBike(email, bike, "XY99ZZZ");
    expect(mocks.fetchMotHistoryFromVdg).toHaveBeenCalledWith("XY99ZZZ");
  });

  // ── Deduplication against existing bills ────────────────────────────────

  it("skips a test whose date is already logged as an mot-test bill", async () => {
    mocks.getBills.mockResolvedValue([
      { billType: "mot-test", date: "2025-01-15T00:00:00.000Z" },
    ]);
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
      skipped: [{ date: "2025-01-15", reason: "Already logged." }],
    });
  });

  it("does not skip a test just because a non-MOT bill exists on the same date", async () => {
    mocks.getBills.mockResolvedValue([
      { billType: "insurance", date: "2025-01-15T00:00:00.000Z" },
    ]);
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 0 });
  });

  it("matches already-logged dates by day prefix regardless of time component", async () => {
    mocks.getBills.mockResolvedValue([
      { billType: "mot-test", date: "2025-01-15T14:30:00.000Z" }, // same day, different time
    ]);
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).not.toHaveBeenCalled();
    expect(result).toMatchObject({ skippedCount: 1 });
  });

  // ── Production year guard ────────────────────────────────────────────────

  it("skips a test that isBeforeProduction returns true for", async () => {
    mocks.isBeforeProduction.mockReturnValue(true);
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      createdCount: 0,
      skippedCount: 1,
      skipped: [{ date: "2025-01-15", reason: expect.stringContaining("production year") }],
    });
  });

  it("passes each test and the bike to isBeforeProduction", async () => {
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.isBeforeProduction).toHaveBeenCalledWith(passedTest.testDate, bike);
  });

  // ── Multiple tests ───────────────────────────────────────────────────────

  it("processes multiple tests independently — create some, skip others", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue({
      motDueDate: "2026-01-15",
      tests: [failedTest, passedTest],
    });
    // failedTest date already logged
    mocks.getBills.mockResolvedValue([
      { billType: "mot-test", date: "2024-06-01T00:00:00.000Z" },
    ]);
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(result).toMatchObject({ createdCount: 1, skippedCount: 1 });
    expect(mocks.createBill).toHaveBeenCalledOnce();
  });

  // ── Reminder handling ────────────────────────────────────────────────────

  it("sets a reminder and returns reminderSet:true when motDueDate is present", async () => {
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(result).toMatchObject({ reminderSet: true, motDueDate: "2026-01-15" });
    expect(mocks.deleteRemindersBySourceKey).toHaveBeenCalledWith(
      email, "bike-1", "bill:mot-test"
    );
    expect(mocks.createReminder).toHaveBeenCalledWith(email, expect.objectContaining({
      bikeId: "bike-1",
      name: "MOT renewal",
      intervalType: "date",
      sourceKey: "bill:mot-test",
    }));
  });

  it("uses motReminderDate to calculate the reminder's exactDate", async () => {
    mocks.motReminderDate.mockReturnValue("2025-12-16");
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.motReminderDate).toHaveBeenCalledWith("2026-01-15");
    expect(mocks.createReminder).toHaveBeenCalledWith(email, expect.objectContaining({
      exactDate: "2025-12-16",
    }));
  });

  it("deletes the existing reminder before creating the new one", async () => {
    const callOrder: string[] = [];
    mocks.deleteRemindersBySourceKey.mockImplementation(() => {
      callOrder.push("delete");
      return Promise.resolve();
    });
    mocks.createReminder.mockImplementation(() => {
      callOrder.push("create");
      return Promise.resolve();
    });
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(callOrder).toEqual(["delete", "create"]);
  });

  it("returns reminderSet:false and does not create a reminder when motDueDate is null", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue({
      motDueDate: null,
      tests: [passedTest],
    });
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(result).toMatchObject({ reminderSet: false });
    expect(mocks.createReminder).not.toHaveBeenCalled();
    expect(mocks.deleteRemindersBySourceKey).not.toHaveBeenCalled();
  });

  // ── Fuel mileage re-estimation ───────────────────────────────────────────

  it("calls reestimateFuelMileage when at least one test was created", async () => {
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.reestimateFuelMileage).toHaveBeenCalledWith(email, bike);
  });

  it("does not call reestimateFuelMileage when no tests were created", async () => {
    // All tests already logged
    mocks.getBills.mockResolvedValue([
      { billType: "mot-test", date: "2025-01-15T00:00:00.000Z" },
    ]);
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.reestimateFuelMileage).not.toHaveBeenCalled();
  });

  it("still returns success if reestimateFuelMileage throws", async () => {
    mocks.reestimateFuelMileage.mockRejectedValue(new Error("re-estimate failed"));
    const result = await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(result).toMatchObject({ createdCount: 1 });
  });

  // ── Bill cost is always zero ─────────────────────────────────────────────

  it("always creates bills with cost 0 regardless of any test data", async () => {
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).toHaveBeenCalledWith(email, expect.objectContaining({ cost: 0 }));
  });

  // ── Null mileage handling ────────────────────────────────────────────────

  it("omits mileage from the bill when the test has no mileage", async () => {
    mocks.fetchMotHistoryFromVdg.mockResolvedValue({
      motDueDate: "2026-01-15",
      tests: [{ ...passedTest, mileage: null }],
    });
    await importMotHistoryForBike(email, bike, "AB12CDE");
    expect(mocks.createBill).toHaveBeenCalledWith(email, expect.objectContaining({
      mileage: undefined,
    }));
  });
});
