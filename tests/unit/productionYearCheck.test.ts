import { describe, expect, it } from "vitest";
import { isBeforeProduction } from "@/lib/tracker/productionYearCheck";

describe("isBeforeProduction", () => {
  it("flags a date before January 1st of the production year", () => {
    expect(isBeforeProduction("2017-12-31", { year: 2018 })).toBe(true);
  });

  it("does not flag January 1st itself, or anything after", () => {
    expect(isBeforeProduction("2018-01-01", { year: 2018 })).toBe(false);
    expect(isBeforeProduction("2020-01-01", { year: 2018 })).toBe(false);
  });

  it("never flags a custom build, regardless of date", () => {
    expect(isBeforeProduction("1900-01-01", { year: 2018, isCustomBuild: true })).toBe(false);
  });

  it("never flags a bike with no recorded production year", () => {
    expect(isBeforeProduction("1900-01-01", {})).toBe(false);
  });
});