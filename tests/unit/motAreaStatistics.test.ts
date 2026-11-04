// The generated MOT-by-area figures hang together: every ranked area is big
// enough, the counts nest inside each other and inside the national total,
// and the areas run from the highest fail rate to the lowest.
import { describe, expect, it } from "vitest";
import { MOT_AREA_STATISTICS as A } from "@/lib/mot/motAreaStatistics";

const rate = (a: { tests: number; failedFirstTime: number }) => a.failedFirstTime / a.tests;

describe("MOT_AREA_STATISTICS", () => {
  it("ranks only areas with enough tests, each once, and none of the ones left out", () => {
    const codes = A.areas.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const a of A.areas) expect(a.tests, a.code).toBeGreaterThanOrEqual(A.minTests);
    for (const code of A.leftOut) expect(codes).not.toContain(code);
  });

  it("nests dangerous inside failed inside tested, and the areas inside Great Britain", () => {
    for (const a of [...A.areas, A.greatBritain]) {
      expect(a.failedFirstTime).toBeLessThanOrEqual(a.tests);
      expect(a.testsWithDangerousDefect).toBeLessThanOrEqual(a.failedFirstTime);
      expect(a.averageAgeYears).toBeGreaterThan(0);
    }
    for (const field of ["tests", "failedFirstTime", "testsWithDangerousDefect"] as const) {
      expect(A.areas.reduce((sum, a) => sum + a[field], 0), field).toBeLessThanOrEqual(A.greatBritain[field]);
    }
  });

  it("orders the areas from the highest first-time fail rate to the lowest", () => {
    for (let i = 1; i < A.areas.length; i++) expect(rate(A.areas[i - 1])).toBeGreaterThanOrEqual(rate(A.areas[i]));
  });

  it("names a top failure for every area", () => {
    for (const a of A.areas) {
      expect(a.topFailure.defect.length, a.code).toBeGreaterThan(0);
      expect(a.topFailure.times, a.code).toBeGreaterThan(0);
    }
  });
});
