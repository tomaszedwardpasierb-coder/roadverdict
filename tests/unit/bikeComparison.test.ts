import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBike: vi.fn(),
  isBikeReadOnly: vi.fn(),
  getServiceRecords: vi.fn(),
  getFuelLogs: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
  materializeAllDueForBike: vi.fn(),
  getSellerReportCore: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike, isBikeReadOnly: mocks.isBikeReadOnly }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
// computeActualMPG is pure (re-exported from mpgCalc.ts) - kept real via
// importOriginal, same reasoning as sellerReportData.test.ts's own
// bike.ts mock. Only getFuelLogs is a genuine I/O boundary here.
vi.mock("@/lib/tracker/fuelLog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tracker/fuelLog")>();
  return { ...actual, getFuelLogs: mocks.getFuelLogs };
});
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/tracker/billSeries", () => ({ materializeAllDueForBike: mocks.materializeAllDueForBike }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportCore: mocks.getSellerReportCore }));
// computeSpendSummary/computeYearSpend (summary.ts) and monthsBetween
// (reminderStatus.ts) are pure, no I/O - deliberately not mocked, same
// convention as every other pure dependency in this codebase's tests.

import { buildBikeComparisonEntry, buildBikeComparison } from "@/lib/tracker/bikeComparison";

const email = "rider@example.com";

function makeBike(overrides: Record<string, unknown> = {}) {
  return {
    id: "bike-1",
    pk: email,
    type: "bike",
    make: "Honda",
    model: "Africa Twin",
    nickname: "",
    currentMileage: 10000,
    startingMileage: 2000,
    dateAdded: "2024-01-01",
    ...overrides,
  };
}

function makeCore(overrides: Record<string, unknown> = {}) {
  return {
    evidenceQuality: { totalRecords: 0, receiptCount: 0, receiptCoveragePct: 0, realTimeCount: 0, realTimePct: 0, longestGapDays: 0, mileageInternallyConsistent: true },
    upcomingReminders: [],
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getBike.mockResolvedValue(makeBike());
  mocks.isBikeReadOnly.mockReturnValue(false);
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getMods.mockResolvedValue([]);
  mocks.getBills.mockResolvedValue([]);
  mocks.materializeAllDueForBike.mockResolvedValue(undefined);
  mocks.getSellerReportCore.mockResolvedValue(makeCore());
});

describe("buildBikeComparisonEntry", () => {
  it("returns null when the bike doesn't exist", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await buildBikeComparisonEntry(email, "bike-1")).toBeNull();
    expect(mocks.getServiceRecords).not.toHaveBeenCalled();
  });

  it("materialises due instalments before reading bills, for a bike that isn't read-only", async () => {
    await buildBikeComparisonEntry(email, "bike-1");
    expect(mocks.materializeAllDueForBike).toHaveBeenCalledWith(email, "bike-1");
  });

  it("skips materialisation for a transferred (read-only) bike", async () => {
    mocks.isBikeReadOnly.mockReturnValue(true);
    await buildBikeComparisonEntry(email, "bike-1");
    expect(mocks.materializeAllDueForBike).not.toHaveBeenCalled();
  });

  it("computes milesRidden as currentMileage minus startingMileage, not the raw odometer", async () => {
    mocks.getBike.mockResolvedValue(makeBike({ currentMileage: 15000, startingMileage: 5000 }));
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.milesRidden).toBe(10000);
  });

  it("clamps milesRidden to 0 rather than going negative", async () => {
    mocks.getBike.mockResolvedValue(makeBike({ currentMileage: 3000, startingMileage: 5000 }));
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.milesRidden).toBe(0);
  });

  it("computes costPerMile from real spend (servicing + mods + bills + fuel) over milesRidden", async () => {
    mocks.getBike.mockResolvedValue(makeBike({ currentMileage: 6000, startingMileage: 1000 })); // 5000 miles ridden
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1", cost: 200, date: "2025-01-01", mileage: 3000 }]);
    mocks.getFuelLogs.mockResolvedValue([{ id: "fl-1", cost: 300, date: "2025-01-01", mileage: 3000 }]);
    mocks.getMods.mockResolvedValue([{ id: "m-1", cost: 100, date: "2025-01-01", mileage: 3000 }]);
    mocks.getBills.mockResolvedValue([{ id: "bl-1", cost: 400, date: "2025-01-01" }]);
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    // total spend 1000 over 5000 miles ridden = £0.20/mile
    expect(entry?.spend.grandTotal).toBe(1000);
    expect(entry?.costPerMile).toBeCloseTo(0.2);
  });

  it("returns null costPerMile rather than dividing by zero when no miles have been ridden yet", async () => {
    mocks.getBike.mockResolvedValue(makeBike({ currentMileage: 1000, startingMileage: 1000 }));
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.milesRidden).toBe(0);
    expect(entry?.costPerMile).toBeNull();
  });

  it("takes documentationPct from the already-computed evidenceQuality, not a second calculation", async () => {
    mocks.getSellerReportCore.mockResolvedValue(makeCore({
      evidenceQuality: { totalRecords: 4, receiptCount: 3, receiptCoveragePct: 75, realTimeCount: 4, realTimePct: 100, longestGapDays: 0, mileageInternallyConsistent: true },
    }));
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.documentationPct).toBe(75);
  });

  it("surfaces the soonest upcoming reminder as nextDue", async () => {
    mocks.getSellerReportCore.mockResolvedValue(makeCore({
      upcomingReminders: [{ reminder: { name: "Insurance renewal" }, status: "overdue" }],
    }));
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.nextDue).toEqual({ name: "Insurance renewal", status: "overdue" });
  });

  it("returns nextDue null when nothing is due soon", async () => {
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.nextDue).toBeNull();
  });

  it("picks the most recently dated service record as lastService", async () => {
    mocks.getServiceRecords.mockResolvedValue([
      { id: "sr-1", cost: 50, date: "2024-01-01", mileage: 3000 },
      { id: "sr-2", cost: 60, date: "2025-06-01", mileage: 8000 },
    ]);
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.lastServiceDate).toBe("2025-06-01");
    expect(entry?.lastServiceMileage).toBe(8000);
  });

  it("returns null lastService fields when there's no service history", async () => {
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.lastServiceDate).toBeNull();
    expect(entry?.lastServiceMileage).toBeNull();
  });

  it("builds the display name from nickname + make + model when a nickname is set", async () => {
    mocks.getBike.mockResolvedValue(makeBike({ nickname: "Bessie" }));
    const entry = await buildBikeComparisonEntry(email, "bike-1");
    expect(entry?.name).toBe("Bessie - Honda Africa Twin");
  });
});

describe("buildBikeComparison", () => {
  it("fetches every requested bike and filters out ones that didn't resolve", async () => {
    mocks.getBike.mockImplementation(async (_email: string, bikeId: string) =>
      bikeId === "missing" ? null : makeBike({ id: bikeId })
    );
    const result = await buildBikeComparison(email, ["bike-1", "missing", "bike-2"]);
    expect(result.map((e) => e.bikeId)).toEqual(["bike-1", "bike-2"]);
  });

  it("returns an empty array when none of the requested bikes resolve", async () => {
    mocks.getBike.mockResolvedValue(null);
    const result = await buildBikeComparison(email, ["a", "b"]);
    expect(result).toEqual([]);
  });
});
