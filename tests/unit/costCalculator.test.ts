import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentPetrolPricePenceLitre: vi.fn(),
}));

vi.mock("@/lib/fuelPrice", () => ({
  getCurrentPetrolPricePenceLitre: mocks.getCurrentPetrolPricePenceLitre,
}));
// priceData.ts (getAdjustedBenchmark) is deliberately NOT mocked - it's
// pure, no I/O, and using the real benchmark data means this test tracks
// legitimate benchmark updates automatically rather than hardcoding
// priceData's own numbers here and going stale whenever those change for
// reasons that have nothing to do with costCalculator's own math.

import { computeAnnualCost } from "@/lib/costCalculator";
import { getAdjustedBenchmark } from "@/lib/priceData";

describe("computeAnnualCost", () => {
  beforeEach(() => {
    mocks.getCurrentPetrolPricePenceLitre.mockReset();
    mocks.getCurrentPetrolPricePenceLitre.mockResolvedValue(145);
  });

  function expectedServicingAndTyres(bikeClass: "small" | "medium" | "large", brand: string, region: "rest-england-wales", mileage: number) {
    const service = getAdjustedBenchmark("full-service", bikeClass, brand, region);
    const servicing = Math.round((service.low + service.high) / 2);
    const tyrePair = getAdjustedBenchmark("tyres-pair", bikeClass, brand, region);
    const tyreMidpoint = (tyrePair.low + tyrePair.high) / 2;
    const tyres = Math.round(tyreMidpoint * (mileage / 5000));
    return { servicing, tyres };
  }

  it("computes servicing and tyres from the real benchmark data, not a hardcoded figure", async () => {
    const result = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 4000);
    const expected = expectedServicingAndTyres("medium", "yamaha", "rest-england-wales", 4000);

    expect(result.servicing).toBe(expected.servicing);
    expect(result.tyres).toBe(expected.tyres);
  });

  // Precomputed by hand against the real formula and constants - these
  // don't depend on priceData at all, so unlike servicing/tyres above,
  // hardcoding the expected number here is safe and won't go stale.
  it("computes fuel cost correctly for a medium bike", async () => {
    const result = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 4000);
    expect(result.fuel).toBe(463);
  });

  it("applies the small-bike fuel multiplier (better mpg, lower cost)", async () => {
    const result = await computeAnnualCost("small", "yamaha", "rest-england-wales", 4000);
    expect(result.fuel).toBe(393);
  });

  it("applies the large-bike fuel multiplier (worse mpg, higher cost)", async () => {
    const result = await computeAnnualCost("large", "yamaha", "rest-england-wales", 4000);
    expect(result.fuel).toBe(555);
  });

  it("reads the current petrol price via getCurrentPetrolPricePenceLitre rather than a fixed constant", async () => {
    mocks.getCurrentPetrolPricePenceLitre.mockResolvedValue(200);
    const cheap = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 4000);
    mocks.getCurrentPetrolPricePenceLitre.mockResolvedValue(100);
    const expensive = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 4000);

    expect(cheap.fuel).toBeGreaterThan(expensive.fuel);
  });

  // MOT is a flat figure regardless of bike class - the source comment
  // explains why (statutory cap vs real average market rate), but the
  // function itself doesn't vary it, so worth confirming that directly.
  it("charges the same flat MOT figure regardless of bike class", async () => {
    const small = await computeAnnualCost("small", "yamaha", "rest-england-wales", 4000);
    const large = await computeAnnualCost("large", "yamaha", "rest-england-wales", 4000);
    expect(small.mot).toBe(28);
    expect(large.mot).toBe(28);
  });

  // Genuinely surprising if you didn't know it, and worth a test that
  // names it directly: medium and large bikes pay the exact same VED,
  // because most bikes RoadVerdict calls "medium" are actually over the
  // 600cc DVLA banding line - documented explicitly in the source.
  it("charges medium and large bikes the same VED rate, per the documented 600cc banding quirk", async () => {
    const medium = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 4000);
    const large = await computeAnnualCost("large", "yamaha", "rest-england-wales", 4000);
    expect(medium.tax).toBe(125);
    expect(large.tax).toBe(125);
  });

  it("charges a lower VED rate for a small bike", async () => {
    const result = await computeAnnualCost("small", "yamaha", "rest-england-wales", 4000);
    expect(result.tax).toBe(59);
  });

  it("totals all five components correctly, not just some of them", async () => {
    const result = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 4000);
    expect(result.total).toBe(result.servicing + result.tyres + result.mot + result.tax + result.fuel);
  });

  it("returns zero fuel and zero tyre cost for zero annual mileage, without dividing by zero or producing NaN", async () => {
    const result = await computeAnnualCost("medium", "yamaha", "rest-england-wales", 0);
    expect(result.fuel).toBe(0);
    expect(result.tyres).toBe(0);
    expect(Number.isNaN(result.total)).toBe(false);
  });
});