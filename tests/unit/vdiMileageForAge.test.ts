// The history check's mileage-for-age figure is a lifetime total, so it's
// turned into a yearly one before it sits next to the vehicle's own.
import { describe, expect, it } from "vitest";
import { typicalAnnualMileage, typicalMileageText } from "@/lib/tracker/vdiMileageForAge";

const NOW = new Date("2026-11-03T12:00:00Z");

describe("typicalAnnualMileage", () => {
  it("divides the total by the vehicle's whole years", () => {
    expect(typicalAnnualMileage({ averageMileageForAge: 228000, dateFirstRegisteredInUk: "2007-03-20" }, NOW)).toBe(12000);
    // Falls back to the manufacture date; a year short of its birthday counts one fewer.
    expect(typicalAnnualMileage({ averageMileageForAge: 60000, dateOfManufacture: "2021-12-01" }, NOW)).toBe(15000);
  });

  it("has nothing to say without a total or an age of at least a year", () => {
    expect(typicalAnnualMileage({ averageMileageForAge: null, dateFirstRegisteredInUk: "2007-03-20" }, NOW)).toBeNull();
    expect(typicalAnnualMileage({ averageMileageForAge: 228000 }, NOW)).toBeNull();
    expect(typicalAnnualMileage({ averageMileageForAge: 6000, dateFirstRegisteredInUk: "2026-05-01" }, NOW)).toBeNull();
  });
});

describe("typicalMileageText", () => {
  it("speaks per year when it can, and in total when it can't", () => {
    expect(typicalMileageText({ averageMileageForAge: 228000, dateFirstRegisteredInUk: "2007-03-20" }, NOW)).toBe(
      "about 12,000 miles a year is typical for its age"
    );
    expect(typicalMileageText({ averageMileageForAge: 228000 }, NOW)).toBe("about 228,000 miles in total is typical for its age");
  });
});
