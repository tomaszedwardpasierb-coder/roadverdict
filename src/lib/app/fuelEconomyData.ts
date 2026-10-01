// Place at: src/lib/app/fuelEconomyData.ts
//
// The Android app's Fuel economy screen for one of the signed-in owner's
// vehicles: the same summary the website's Fuel tab card shows (see
// fuelEconomySummary.ts) - the average of the trusted tanks, the last
// full tank, the last fill-up's price per litre in the owner's currency -
// plus the units and the official figure to compare with. A fully
// electric car has no MPG at all. The vehicle is looked up inside the
// signed-in account's own partition, so anyone else's simply isn't found.
import { getBike } from "@/lib/tracker/bike";
import { getCarById } from "@/lib/tracker/car";
import type { VehicleKind } from "@/lib/tracker/activeVehicle";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { computeMPGSeries } from "@/lib/tracker/mpgCalc";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import { fuelEconomySummary, type FuelEconomySummary } from "@/lib/tracker/fuelEconomySummary";
import type { Currency } from "@/lib/tracker/currency";
import type { DistanceUnit, FuelEconomyUnit } from "@/lib/tracker/unitFormat";

export type FuelEconomyData = {
  electric: boolean;
  summary: FuelEconomySummary;
  officialMpg: number | null;
  fuelEconomyUnit: FuelEconomyUnit;
  distanceUnit: DistanceUnit;
  currency: Currency;
  // Which of this week's UK averages to offer first.
  preferredFuel: "petrol" | "diesel";
};

const EMPTY: FuelEconomySummary = { averageMpg: null, trustedTanks: 0, lastTank: null, lastPrice: null };

export async function getFuelEconomy(email: string, kind: VehicleKind, id: string): Promise<FuelEconomyData | null> {
  if (kind === "bike") {
    const bike = await getBike(email, id);
    if (!bike) return null;
    const currency = bike.currency ?? "GBP";
    const [fuelLogs, rates] = await Promise.all([getFuelLogs(email, bike.id), getExchangeRates()]);
    const officialMpg = bike.dvlaData?.officialCombinedMpg ?? null;
    return {
      electric: false,
      summary: fuelEconomySummary(computeMPGSeries(fuelLogs, officialMpg ?? undefined), fuelLogs, currency, rates),
      officialMpg,
      fuelEconomyUnit: bike.fuelEconomyUnit ?? "mpg",
      distanceUnit: bike.distanceUnit ?? "mi",
      currency,
      preferredFuel: "petrol",
    };
  }

  const car = await getCarById(email, id);
  if (!car) return null;
  const currency = car.currency ?? "GBP";
  const base = {
    officialMpg: car.dvlaData?.officialCombinedMpg ?? null,
    fuelEconomyUnit: car.fuelEconomyUnit ?? "mpg",
    distanceUnit: car.distanceUnit ?? "mi",
    currency,
    preferredFuel: car.fuelType === "diesel" ? "diesel" : "petrol",
  } as const;
  if (car.fuelType === "electric") return { electric: true, summary: EMPTY, ...base };

  const [fuelLogs, rates] = await Promise.all([getCarFuelLogs(email, car.id), getExchangeRates()]);
  // A charge has no litres - economy only comes from fill-ups, as on the web.
  const series = computeMPGSeries(
    fuelLogs
      .filter((f): f is typeof f & { litres: number } => f.litres != null)
      .map((f) => ({
        id: f.id,
        mileage: f.mileage,
        litres: f.litres,
        filledToFull: f.filledToFull ?? false,
        date: f.date,
        mileageConfidence: f.mileageConfidence,
        mileageAnomaly: f.mileageAnomaly,
      })),
    base.officialMpg ?? undefined
  );
  return { electric: false, summary: fuelEconomySummary(series, fuelLogs, currency, rates), ...base };
}
