// Place at: src/lib/tracker/fuelEconomySummary.ts
//
// What the Fuel tab's economy card shows, from the same per-tank series
// the MPG chart uses (computeMPGSeries): the average of the trusted tanks
// (so it matches computeActualMPG), how many there were, the latest one,
// and the latest priced fill-up's price per litre in the owner's own
// currency. Pure - both the bike and the car dashboard build it.
import { convertGbpToDisplay, type Currency, type ExchangeRates } from "./currency";
import type { MpgSegment } from "./mpgCalc";

export type FuelEconomySummary = {
  averageMpg: number | null;
  trustedTanks: number;
  lastTank: { miles: number; litres: number; mpg: number; date: string } | null;
  lastPrice: { perLitre: number; date: string } | null;
};

export function fuelEconomySummary(
  series: MpgSegment[],
  // Stored costs are GBP; a car's charging entries carry no litres.
  fuelLogs: { date: string; mileage: number; litres?: number | null; cost: number }[],
  currency: Currency,
  rates: ExchangeRates | null
): FuelEconomySummary {
  // The series runs in mileage order, so the last trusted tank is the latest.
  const trusted = series.filter((s) => !s.likelyMissedFillUps);
  const latest = trusted.length > 0 ? trusted[trusted.length - 1] : null;
  const priced = fuelLogs
    .filter((f): f is typeof f & { litres: number } => f.litres != null && f.litres > 0 && f.cost > 0)
    .sort((a, b) => b.date.localeCompare(a.date) || b.mileage - a.mileage)[0];
  return {
    averageMpg: trusted.length > 0 ? trusted.reduce((sum, s) => sum + s.mpg, 0) / trusted.length : null,
    trustedTanks: trusted.length,
    lastTank: latest?.miles && latest.litres ? { miles: latest.miles, litres: latest.litres, mpg: latest.mpg, date: latest.date } : null,
    lastPrice: priced ? { perLitre: convertGbpToDisplay(priced.cost, currency, rates) / priced.litres, date: priced.date } : null,
  };
}
