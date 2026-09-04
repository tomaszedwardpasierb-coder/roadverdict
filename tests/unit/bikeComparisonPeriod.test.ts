import { describe, expect, it } from "vitest";
import { isDateInRange, mileageAsOf } from "@/lib/tracker/bikeComparisonPeriod";

describe("isDateInRange", () => {
  it("is true for anything when no period is given (overall)", () => {
    expect(isDateInRange("2020-01-01")).toBe(true);
    expect(isDateInRange("2030-01-01")).toBe(true);
  });

  it("is true for anything when the period has neither bound set", () => {
    expect(isDateInRange("2020-01-01", {})).toBe(true);
  });

  it("excludes dates before `from`", () => {
    expect(isDateInRange("2024-12-31", { from: "2025-01-01" })).toBe(false);
    expect(isDateInRange("2025-01-01", { from: "2025-01-01" })).toBe(true);
  });

  it("excludes dates after `to`", () => {
    expect(isDateInRange("2025-06-02", { to: "2025-06-01" })).toBe(false);
    expect(isDateInRange("2025-06-01", { to: "2025-06-01" })).toBe(true);
  });

  it("requires both bounds when both are set (a specific period)", () => {
    const period = { from: "2025-01-01", to: "2025-06-01" };
    expect(isDateInRange("2025-03-15", period)).toBe(true);
    expect(isDateInRange("2024-12-01", period)).toBe(false);
    expect(isDateInRange("2025-07-01", period)).toBe(false);
  });
});

describe("mileageAsOf", () => {
  const points = [
    { date: "2025-01-01", mileage: 1000 },
    { date: "2025-03-01", mileage: 2000 },
    { date: "2025-06-01", mileage: 3500 },
  ];

  it("returns the fallback when no boundary is given", () => {
    expect(mileageAsOf(points, undefined, 999)).toBe(999);
  });

  it("returns the fallback when nothing was logged before the boundary yet", () => {
    expect(mileageAsOf(points, "2024-06-01", 500)).toBe(500);
  });

  it("returns the most recent point on or before the boundary", () => {
    expect(mileageAsOf(points, "2025-04-01", 0)).toBe(2000);
  });

  it("includes a point exactly on the boundary date", () => {
    expect(mileageAsOf(points, "2025-03-01", 0)).toBe(2000);
  });

  it("ignores points after the boundary even if they're the highest mileage", () => {
    expect(mileageAsOf(points, "2025-02-01", 0)).toBe(1000);
  });

  it("works correctly with unsorted input", () => {
    const shuffled = [points[2], points[0], points[1]];
    expect(mileageAsOf(shuffled, "2025-04-01", 0)).toBe(2000);
  });
});
