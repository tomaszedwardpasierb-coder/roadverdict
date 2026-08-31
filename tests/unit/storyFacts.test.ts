import { describe, expect, it } from "vitest";
import {
  computeBikeIdentity,
  computeCategorySpend,
  computeServiceRhythm,
  computeMpgTrend,
  jobLabel,
} from "@/lib/tracker/storyFacts";

describe("computeBikeIdentity", () => {
  it("carries the bike's own fields through, including a computed logged-span in years", () => {
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86_400_000).toISOString();
    const identity = computeBikeIdentity(
      { make: "Honda", model: "CB500F", year: 2019, currentMileage: 8000, dateAdded: twoYearsAgo },
      42
    );
    expect(identity).toMatchObject({ make: "Honda", model: "CB500F", year: 2019, currentMileage: 8000, loggedSinceDate: twoYearsAgo, totalLoggedEvents: 42 });
    expect(identity.loggedSpanYears).toBeGreaterThan(1.9);
    expect(identity.loggedSpanYears).toBeLessThan(2.1);
  });

  it("leaves year undefined for a bike with none recorded", () => {
    const identity = computeBikeIdentity({ make: "Honda", model: "CB500F", year: undefined, currentMileage: 100, dateAdded: new Date().toISOString() }, 0);
    expect(identity.year).toBeUndefined();
  });
});

describe("computeCategorySpend", () => {
  it("buckets service/modification/bill rows by category and adds fuel from its own separate total", () => {
    const rows = [
      { category: "Service", cost: 100 },
      { category: "Service", cost: 50 },
      { category: "Modification", cost: 300 },
      { category: "Bill", cost: 80 },
    ];
    const result = computeCategorySpend(rows, 200, 4);
    expect(result).toContainEqual({ category: "Service", total: 150, count: 2 });
    expect(result).toContainEqual({ category: "Fuel", total: 200, count: 4 });
    expect(result).toContainEqual({ category: "Modifications", total: 300, count: 1 });
    expect(result).toContainEqual({ category: "Bills", total: 80, count: 1 });
  });

  it("always returns all four categories, even ones with nothing logged", () => {
    const result = computeCategorySpend([], 0, 0);
    expect(result.map((r) => r.category).sort()).toEqual(["Bills", "Fuel", "Modifications", "Service"].sort());
    expect(result.every((r) => r.total === 0 && r.count === 0)).toBe(true);
  });

  it("sorts categories by total spend, highest first", () => {
    const rows = [{ category: "Service", cost: 10 }, { category: "Modification", cost: 500 }];
    const result = computeCategorySpend(rows, 50, 1);
    expect(result.map((r) => r.category)).toEqual(["Modifications", "Fuel", "Service", "Bills"]);
  });
});

describe("computeServiceRhythm", () => {
  it("reports just the count, with null gaps, for fewer than 2 records", () => {
    expect(computeServiceRhythm([])).toEqual({ serviceCount: 0, averageGapDays: null, longestGapDays: null, longestGapStartDate: null, longestGapEndDate: null });
    expect(computeServiceRhythm([{ date: "2025-01-01" }])).toEqual({ serviceCount: 1, averageGapDays: null, longestGapDays: null, longestGapStartDate: null, longestGapEndDate: null });
  });

  it("computes the average and longest gap across unsorted records, sorting them internally first", () => {
    // Deliberately out of order - 90 days, then 30 days between them once sorted.
    const records = [{ date: "2025-04-01" }, { date: "2025-01-01" }, { date: "2025-05-01" }];
    const rhythm = computeServiceRhythm(records);
    expect(rhythm.serviceCount).toBe(3);
    expect(rhythm.longestGapDays).toBe(90);
    expect(rhythm.longestGapStartDate).toBe("2025-01-01");
    expect(rhythm.longestGapEndDate).toBe("2025-04-01");
    expect(rhythm.averageGapDays).toBe(60); // (90 + 30) / 2
  });
});

describe("computeMpgTrend", () => {
  const base = { litres: 18.184, filledToFull: true }; // 200 miles per fill at these litres = 50 mpg

  it("reports insufficient data with fewer than 2 valid segments", () => {
    const logs = [
      { id: "f1", mileage: 1000, date: "2025-01-01", ...base },
      { id: "f2", mileage: 1200, date: "2025-01-15", ...base },
    ];
    // Only one segment is ever produced from two fill-ups.
    const trend = computeMpgTrend(logs);
    expect(trend.hasEnoughData).toBe(false);
    expect(trend.overallAverageMpg).toBeNull();
    expect(trend.recentAverageMpg).toBeNull();
  });

  // Uses an explicit, owner-confirmed mileageAnomaly flag to guarantee
  // exactly one excluded segment deterministically, rather than trying
  // to reverse-engineer computeMPGSeries' own statistical thresholds
  // (already covered by mpgCalc.test.ts) - this test is about
  // computeMpgTrend's own filtering/averaging/capping, not about
  // anomaly detection itself.
  it("excludes flagged segments from the average, counts them, and caps 'recent' at 5 segments", () => {
    const logs = [
      { id: "f1", mileage: 1000, date: "2025-01-01", ...base },
      { id: "f2", mileage: 1200, date: "2025-01-08", ...base },
      { id: "f3", mileage: 1400, date: "2025-01-15", ...base },
      { id: "f4", mileage: 1600, date: "2025-01-22", ...base },
      { id: "f5", mileage: 1800, date: "2025-01-29", ...base, mileageAnomaly: true },
      { id: "f6", mileage: 2000, date: "2025-02-05", ...base },
      { id: "f7", mileage: 2200, date: "2025-02-12", ...base },
    ];

    const trend = computeMpgTrend(logs);

    expect(trend.hasEnoughData).toBe(true);
    expect(trend.anomalyCount).toBe(1);
    expect(trend.recentSegmentCount).toBe(5);
    expect(trend.overallAverageMpg).toBeCloseTo(50, 5);
    expect(trend.recentAverageMpg).toBeCloseTo(50, 5);
  });
});

describe("jobLabel", () => {
  it("returns the known label for a recognised job type", () => {
    expect(jobLabel("oil-filter")).toBe("Oil & filter change");
  });

  it("falls back to the raw job type string for one it doesn't recognise", () => {
    expect(jobLabel("some-future-job-type")).toBe("some-future-job-type");
  });
});