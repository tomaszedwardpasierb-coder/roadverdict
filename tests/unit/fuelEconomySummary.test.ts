import { describe, expect, it } from "vitest";
import { fuelEconomySummary } from "@/lib/tracker/fuelEconomySummary";
import type { MpgSegment } from "@/lib/tracker/mpgCalc";

const tank = (overrides: Partial<MpgSegment>): MpgSegment => ({
  mileage: 1000,
  mpg: 50,
  date: "2026-09-01",
  fuelLogId: "fuel-1",
  likelyMissedFillUps: false,
  ...overrides,
});

describe("fuelEconomySummary", () => {
  it("averages only the trusted tanks, and keeps the latest one with its working", () => {
    const summary = fuelEconomySummary(
      [
        tank({ mileage: 1200, mpg: 50, miles: 200, litres: 18.2, date: "2026-08-01" }),
        tank({ mileage: 1400, mpg: 20, miles: 200, litres: 45, likelyMissedFillUps: true, exclusionReason: "anomalous-value" }),
        tank({ mileage: 1600, mpg: 54, miles: 200, litres: 16.8, date: "2026-09-01" }),
      ],
      [],
      "GBP",
      null
    );
    expect(summary.averageMpg).toBe(52);
    expect(summary.trustedTanks).toBe(2);
    expect(summary.lastTank).toEqual({ miles: 200, litres: 16.8, mpg: 54, date: "2026-09-01" });
  });

  it("has nothing to show before two full tanks", () => {
    expect(fuelEconomySummary([], [], "GBP", null)).toEqual({ averageMpg: null, trustedTanks: 0, lastTank: null, lastPrice: null });
  });

  it("prices a litre from the latest fill-up with a cost, in the owner's own currency, skipping charges", () => {
    const logs = [
      { date: "2026-09-01", mileage: 1600, litres: 16.8, cost: 25.2 },
      { date: "2026-09-10", mileage: 1700, litres: null, cost: 9.5 },
      { date: "2026-08-01", mileage: 1400, litres: 18, cost: 27 },
    ];
    expect(fuelEconomySummary([], logs, "GBP", null).lastPrice).toEqual({ perLitre: 1.5, date: "2026-09-01" });
    const inEuros = fuelEconomySummary([], logs, "EUR", { base: "GBP", rates: { EUR: 1.2 }, fetchedAt: "2026-09-28T00:00:00Z" }).lastPrice;
    expect(inEuros?.perLitre).toBeCloseTo(1.8, 10);
  });
});
