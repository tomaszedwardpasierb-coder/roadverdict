import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentPetrolPricePenceLitre: vi.fn(),
  getCurrentDieselPricePenceLitre: vi.fn(),
}));

vi.mock("@/lib/fuelPrice", () => ({
  getCurrentPetrolPricePenceLitre: mocks.getCurrentPetrolPricePenceLitre,
  getCurrentDieselPricePenceLitre: mocks.getCurrentDieselPricePenceLitre,
}));
// carPriceData.ts (getAdjustedCarBenchmark) is deliberately NOT mocked -
// same reasoning as costCalculator.test.ts: pure, no I/O, and using the
// real benchmark data means this test tracks legitimate benchmark
// updates automatically rather than going stale for unrelated reasons.

import { computeCarAnnualCost } from "@/lib/carCostCalculator";
import { getAdjustedCarBenchmark } from "@/lib/carPriceData";

describe("computeCarAnnualCost", () => {
  beforeEach(() => {
    mocks.getCurrentPetrolPricePenceLitre.mockReset();
    mocks.getCurrentPetrolPricePenceLitre.mockResolvedValue(145);
    mocks.getCurrentDieselPricePenceLitre.mockReset();
    mocks.getCurrentDieselPricePenceLitre.mockResolvedValue(155);
  });

  function expectedServicingAndTyres(carClass: "small" | "medium" | "large", brand: string, mileage: number) {
    const service = getAdjustedCarBenchmark("full-service", carClass, brand, "rest-england-wales");
    const servicing = Math.round((service.low + service.high) / 2);
    const tyrePair = getAdjustedCarBenchmark("tyres-front-pair", carClass, brand, "rest-england-wales");
    const tyreMidpoint = (tyrePair.low + tyrePair.high) / 2;
    const tyres = Math.round(tyreMidpoint * (mileage / 20000));
    return { servicing, tyres };
  }

  it("computes servicing and tyres from the real benchmark data, not a hardcoded figure", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "petrol", undefined);
    const expected = expectedServicingAndTyres("medium", "ford", 7000);

    expect(result.servicing).toBe(expected.servicing);
    expect(result.tyres).toBe(expected.tyres);
  });

  // Precomputed by hand against the real formula and constants - these
  // don't depend on carPriceData at all, so hardcoding is safe here.
  it("computes petrol fuel cost correctly for a medium car", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "petrol", undefined);
    expect(result.fuel).toBe(1025);
  });

  it("applies the small-car fuel multiplier (better mpg, lower cost)", async () => {
    const result = await computeCarAnnualCost("small", "ford", "rest-england-wales", 7000, "petrol", undefined);
    expect(result.fuel).toBe(872);
  });

  it("applies the large-car fuel multiplier (worse mpg, higher cost)", async () => {
    const result = await computeCarAnnualCost("large", "ford", "rest-england-wales", 7000, "petrol", undefined);
    expect(result.fuel).toBe(1230);
  });

  it("computes diesel fuel cost from its own price and mpg, not the petrol figures", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "diesel", undefined);
    expect(result.fuel).toBe(897);
    expect(mocks.getCurrentDieselPricePenceLitre).toHaveBeenCalled();
    expect(mocks.getCurrentPetrolPricePenceLitre).not.toHaveBeenCalled();
  });

  it("applies the (unsourced, flagged) hybrid mpg multiplier on top of the petrol price", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "hybrid", undefined);
    expect(result.fuel).toBe(789);
  });

  it("treats PHEV the same as hybrid for the fuel estimate (real-world PHEV cost isn't modelled)", async () => {
    const hybrid = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "hybrid", undefined);
    const phev = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "phev", undefined);
    expect(phev.fuel).toBe(hybrid.fuel);
  });

  it("rejects electric cars outright rather than guessing a number", async () => {
    await expect(
      computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "electric", undefined)
    ).rejects.toThrow(/electric/i);
  });

  it("charges the same flat MOT figure regardless of car class", async () => {
    const small = await computeCarAnnualCost("small", "ford", "rest-england-wales", 7000, "petrol", undefined);
    const large = await computeCarAnnualCost("large", "ford", "rest-england-wales", 7000, "petrol", undefined);
    expect(small.mot).toBe(37);
    expect(large.mot).toBe(37);
  });

  it("uses the standard VED rate when a CO2 figure is provided", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "petrol", 120);
    expect(result.tax).toBe(200);
    expect(result.vedUnknown).toBe(false);
  });

  it("shows tax as £0 with an honest vedUnknown flag when no CO2 figure is given, rather than guessing", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "petrol", undefined);
    expect(result.tax).toBe(0);
    expect(result.vedUnknown).toBe(true);
    expect(result.vedCaveat).toBeTruthy();
  });

  it("totals all five components correctly, not just some of them", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 7000, "petrol", 120);
    expect(result.total).toBe(result.servicing + result.tyres + result.mot + result.tax + result.fuel);
  });

  it("returns zero fuel and zero tyre cost for zero annual mileage, without dividing by zero or producing NaN", async () => {
    const result = await computeCarAnnualCost("medium", "ford", "rest-england-wales", 0, "petrol", undefined);
    expect(result.fuel).toBe(0);
    expect(result.tyres).toBe(0);
    expect(Number.isNaN(result.total)).toBe(false);
  });
});
