import { describe, expect, it } from "vitest";
import { convertDistance, economyFromMpg, fuelCostPerDistance, l100kmToMpg, mpgToL100km, tankEconomy } from "@/lib/fuelEconomy";
import { formatFuelEconomy } from "@/lib/tracker/unitFormat";

describe("tankEconomy", () => {
  it("works out UK mpg from miles and litres, with L/100km and US mpg alongside", () => {
    const economy = tankEconomy(400, "mpg", 40)!;
    expect(economy.mpg).toBeCloseTo(45.46, 2); // 400 miles / (40 L / 4.546)
    expect(economy.l100km).toBeCloseTo(6.21, 2); // 40 L over 643.7 km
    expect(economy.usMpg).toBeCloseTo(37.85, 2); // 400 miles / (40 L / 3.785)
  });

  it("takes kilometres when working in L/100km", () => {
    const economy = tankEconomy(500, "l100km", 30)!;
    expect(economy.l100km).toBeCloseTo(6, 10);
    expect(economy.mpg).toBeCloseTo(47.08, 2);
  });

  it("gives nothing for a missing, zero, negative or endless number", () => {
    expect(tankEconomy(NaN, "mpg", 40)).toBeNull();
    expect(tankEconomy(400, "mpg", 0)).toBeNull();
    expect(tankEconomy(-5, "mpg", 10)).toBeNull();
    expect(tankEconomy(Infinity, "mpg", 10)).toBeNull();
  });

  it("agrees with the fuel log's own L/100km figure for the same tank", () => {
    const economy = tankEconomy(400, "mpg", 40)!;
    expect(formatFuelEconomy(economy.mpg, "l100km")).toBe(`${economy.l100km.toFixed(1)} L/100km`);
  });
});

describe("conversions", () => {
  it("converts MPG and L/100km both ways", () => {
    expect(mpgToL100km(50)).toBeCloseTo(5.65, 2);
    expect(l100kmToMpg(mpgToL100km(37))).toBeCloseTo(37, 10);
    expect(economyFromMpg(40).usMpg).toBeCloseTo(33.31, 2);
    expect(economyFromMpg(40).l100km).toBeCloseTo(mpgToL100km(40), 10);
  });

  it("carries a typed distance across the MPG / L/100km switch", () => {
    expect(convertDistance(100, "mpg", "l100km")).toBeCloseTo(160.934, 3);
    expect(convertDistance(160.934, "l100km", "mpg")).toBeCloseTo(100, 3);
    expect(convertDistance(42, "mpg", "mpg")).toBe(42);
  });
});

describe("fuelCostPerDistance", () => {
  it("prices a mile: 40 litres over 400 miles at £1.50 a litre is 15p a mile", () => {
    expect(fuelCostPerDistance(1.5, tankEconomy(400, "mpg", 40)!, "mpg")).toBeCloseTo(0.15, 10);
  });

  it("prices 100 km from L/100km", () => {
    expect(fuelCostPerDistance(1.5, tankEconomy(500, "l100km", 30)!, "l100km")).toBeCloseTo(9, 10);
  });
});
