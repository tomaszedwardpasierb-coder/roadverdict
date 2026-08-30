import { describe, expect, it } from "vitest";
import {
  convertMilesToDisplay,
  convertDisplayToMiles,
  formatDistance,
  distanceUnitLabel,
  formatFuelEconomy,
  formatCostPerDistance,
} from "@/lib/tracker/unitFormat";

describe("distance conversion", () => {
  it("passes miles straight through when the unit is miles", () => {
    expect(convertMilesToDisplay(100, "mi")).toBe(100);
    expect(convertDisplayToMiles(100, "mi")).toBe(100);
  });

  it("round-trips through km without losing the original value", () => {
    const km = convertMilesToDisplay(100, "km");
    expect(convertDisplayToMiles(km, "km")).toBeCloseTo(100, 5);
  });
});

describe("formatDistance", () => {
  it("formats miles with a thousands separator and the 'miles' label", () => {
    expect(formatDistance(12345, "mi")).toBe("12,345 miles");
  });

  it("converts and labels km", () => {
    expect(formatDistance(100, "km")).toBe(`${Math.round(100 * 1.60934).toLocaleString()} km`);
  });
});

describe("distanceUnitLabel", () => {
  it("labels each unit correctly", () => {
    expect(distanceUnitLabel("mi")).toBe("miles");
    expect(distanceUnitLabel("km")).toBe("km");
  });
});

describe("formatFuelEconomy", () => {
  it("formats mpg to one decimal place", () => {
    expect(formatFuelEconomy(55.678, "mpg")).toBe("55.7 mpg");
  });

  // A real reciprocal formula, not a relabel - worth pinning the exact
  // computed figure, not just that it produces some number.
  it("converts to L/100km using the real reciprocal formula", () => {
    expect(formatFuelEconomy(50, "l100km")).toBe("5.6 L/100km");
  });
});

describe("formatCostPerDistance", () => {
  it("formats pence-per-mile directly", () => {
    expect(formatCostPerDistance(12.34, "mi")).toBe("12.3p");
  });

  it("converts to pence-per-km", () => {
    expect(formatCostPerDistance(16.0934, "km")).toBe("10.0p");
  });
});