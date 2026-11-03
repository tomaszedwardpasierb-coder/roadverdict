// The generated MOT statistics hang together: the classes add up to DVSA's
// total, the rates are what DVSA published, and the trend runs year by year.
import { describe, expect, it } from "vitest";
import { MOT_STATISTICS as S } from "@/lib/mot/motStatistics";

const initial = (c: { tests: number; fails: number; passedAfterRectification: number }) =>
  Math.round((10000 * (c.fails + c.passedAfterRectification)) / c.tests) / 100;

describe("MOT_STATISTICS", () => {
  it("adds the four vehicle classes up to DVSA's total", () => {
    const parts = [S.byClass.motorcycles, S.byClass.cars, S.byClass.class5, S.byClass.class7];
    for (const field of ["tests", "fails", "passedAfterRectification", "testsWithDangerousDefect"] as const) {
      expect(parts.reduce((sum, c) => sum + c[field], 0), field).toBe(S.byClass.all[field]);
    }
  });

  it("matches DVSA's published 2025-26 rates, including the corrected dangerous figures", () => {
    expect(initial(S.byClass.cars)).toBe(27.51);
    expect(initial(S.byClass.motorcycles)).toBe(13.4);
    expect(Math.round((10000 * S.byClass.cars.testsWithDangerousDefect) / S.byClass.cars.tests) / 100).toBe(7.22);
    expect(Math.round((10000 * S.byClass.motorcycles.testsWithDangerousDefect) / S.byClass.motorcycles.tests) / 100).toBe(4.11);
  });

  it("runs the trend one year at a time, from 2013-14 to the latest year", () => {
    expect(S.trend[0].year).toBe("2013 to 2014");
    expect(S.trend.at(-1)!.year).toBe(S.year);
    for (let i = 1; i < S.trend.length; i++) {
      expect(Number(S.trend[i].year.slice(0, 4)) - Number(S.trend[i - 1].year.slice(0, 4))).toBe(1);
    }
  });

  it("orders the failure categories from most to least common", () => {
    for (const list of [S.carCategories, S.motorcycleCategories]) {
      for (let i = 1; i < list.length; i++) expect(list[i - 1].percentOfTests).toBeGreaterThanOrEqual(list[i].percentOfTests);
    }
  });
});
