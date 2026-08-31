import { describe, expect, it } from "vitest";
import {
  computeSpendSummary,
  computeYearSpend,
  gatherMileagePoints,
  bucketByMonth,
  bucketByMileage,
} from "@/lib/tracker/summary";

describe("computeSpendSummary", () => {
  it("sums each category separately and adds a grand total across all four", () => {
    const result = computeSpendSummary(
      [{ cost: 100 } as any, { cost: 50 } as any],
      [{ cost: 300 } as any],
      [{ cost: 20 } as any, { cost: 30 } as any],
      [{ cost: 80 } as any]
    );
    expect(result).toEqual({ servicingTotal: 150, modsTotal: 300, fuelTotal: 50, billsTotal: 80, grandTotal: 580 });
  });

  it("returns all zeros for no records at all", () => {
    expect(computeSpendSummary([], [], [], [])).toEqual({ servicingTotal: 0, modsTotal: 0, fuelTotal: 0, billsTotal: 0, grandTotal: 0 });
  });
});

describe("computeYearSpend", () => {
  it("sums only entries whose date falls in the given year, across all four record types", () => {
    const records = [{ date: "2025-01-01", cost: 100 }, { date: "2024-01-01", cost: 999 }] as any;
    const mods = [{ date: "2025-06-01", cost: 50 }] as any;
    const fuelLogs = [{ date: "2026-01-01", cost: 999 }] as any;
    const bills = [{ date: "2025-12-31", cost: 25 }] as any;
    expect(computeYearSpend(records, mods, fuelLogs, bills, 2025)).toBe(175);
  });

  it("returns 0 when nothing falls in the requested year", () => {
    const records = [{ date: "2020-01-01", cost: 100 }] as any;
    expect(computeYearSpend(records, [], [], [], 2025)).toBe(0);
  });
});

describe("gatherMileagePoints", () => {
  it("gathers points from service records, mods, and fuel logs, sorted chronologically", () => {
    const records = [{ id: "sr-1", date: "2025-02-01", mileage: 200 }] as any;
    const mods = [{ id: "m-1", date: "2025-01-01", mileage: 100 }] as any;
    const fuelLogs = [{ id: "f-1", date: "2025-03-01", mileage: 300 }] as any;

    const points = gatherMileagePoints(records, mods, fuelLogs);

    expect(points.map((p) => p.id)).toEqual(["m-1", "sr-1", "f-1"]);
    expect(points[0].category).toBe("mods");
    expect(points[1].category).toBe("service");
    expect(points[2].category).toBe("fuel");
  });

  it("includes only MOT-type bills with a recorded mileage, excluding other bill types and mileage-less MOTs", () => {
    const bills = [
      { id: "b-mot", date: "2025-01-01", mileage: 500, billType: "mot-test" },
      { id: "b-insurance", date: "2025-01-02", mileage: 600, billType: "insurance" },
      { id: "b-mot-no-mileage", date: "2025-01-03", mileage: null, billType: "mot-test" },
    ] as any;

    const points = gatherMileagePoints([], [], [], bills);

    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ id: "b-mot", category: "mot", mileage: 500 });
  });

  it("defaults bills to an empty array when omitted entirely, for existing callers that don't pass one", () => {
    const records = [{ id: "sr-1", date: "2025-01-01", mileage: 100 }] as any;
    expect(gatherMileagePoints(records, [], [])).toHaveLength(1);
  });
});

describe("bucketByMonth", () => {
  it("buckets items into their calendar month, summing cost and collecting every contributing id", () => {
    const items = [
      { id: "a", date: "2025-01-05", cost: 10 },
      { id: "b", date: "2025-01-20", cost: 15 },
      { id: "c", date: "2025-02-01", cost: 20 },
    ];
    const result = bucketByMonth(items);
    expect(result).toHaveLength(2);
    const jan = result.find((r) => r.ids.includes("a"))!;
    expect(jan.total).toBe(25);
    expect(jan.ids.sort()).toEqual(["a", "b"]);
  });

  it("returns months sorted chronologically", () => {
    const items = [
      { id: "a", date: "2025-03-01", cost: 1 },
      { id: "b", date: "2025-01-01", cost: 1 },
      { id: "c", date: "2025-02-01", cost: 1 },
    ];
    const result = bucketByMonth(items);
    expect(result.map((r) => r.month)).toEqual(["Jan 25", "Feb 25", "Mar 25"]);
  });

  it("returns an empty list for no items", () => {
    expect(bucketByMonth([])).toEqual([]);
  });
});

describe("bucketByMileage", () => {
  it("returns an empty list for no items", () => {
    expect(bucketByMileage([])).toEqual([]);
  });

  it("groups items into mileage bands and sums their cost, sorted lowest band first", () => {
    const items = [
      { id: "a", mileage: 100, cost: 10 },
      { id: "b", mileage: 150, cost: 20 },
      { id: "c", mileage: 9000, cost: 30 },
    ];
    const result = bucketByMileage(items);
    expect(result[0].bandStart).toBeLessThan(result[result.length - 1].bandStart);
    // a and b are close together (100/150 miles) so land in the same band.
    const lowBand = result.find((r) => r.ids.includes("a"))!;
    expect(lowBand.ids).toContain("b");
    expect(lowBand.total).toBe(30);
  });

  it("chooses a sensibly larger band size for a bike with much higher mileage logged", () => {
    const lowMileageItems = [{ id: "a", mileage: 100, cost: 1 }, { id: "b", mileage: 2000, cost: 1 }];
    const highMileageItems = [{ id: "a", mileage: 1000, cost: 1 }, { id: "b", mileage: 60000, cost: 1 }];
    const lowResult = bucketByMileage(lowMileageItems);
    const highResult = bucketByMileage(highMileageItems);
    const lowBandSize = lowResult[0].bandEnd - lowResult[0].bandStart;
    const highBandSize = highResult[0].bandEnd - highResult[0].bandStart;
    expect(highBandSize).toBeGreaterThan(lowBandSize);
  });
});