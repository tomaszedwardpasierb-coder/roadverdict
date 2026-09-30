// Place at: src/lib/fuelEconomy.ts
//
// The MPG calculator's maths - the public /mpg-calculator page and the
// dashboard's Fuel tab. Same constants as every other fuel figure on the
// site (UK gallons, 1.60934 km to the mile), so a tank worked out here
// matches what the fuel log itself shows for it. Pure and client-safe:
// nothing here may import Cosmos or anything server-only.
import { KM_PER_MILE, LITRES_PER_UK_GALLON } from "@/lib/tracker/unitFormat";
import type { Currency } from "@/lib/tracker/currency";

export const LITRES_PER_US_GALLON = 3.785411784;

// MPG goes with miles, L/100km with kilometres - the calculator's toggle
// switches both, the way each system is actually used.
export type EconomyUnit = "mpg" | "l100km";

export interface MpgCalculatorAssistantContext {
  unit: EconomyUnit;
  distance: number | null;
  litres: number | null;
  currency: Currency;
  pricePerLitre: number | null;
  priceSource: "saved" | "manual" | "uk-petrol-average" | "uk-diesel-average" | "none";
}

export type TankEconomy = {
  mpg: number;
  l100km: number;
  // The same tank in US gallons - worth showing because American figures
  // turn up everywhere online and look about a fifth worse than UK ones.
  usMpg: number;
};

// One tank: the distance covered (miles for MPG, km for L/100km) and the
// litres it then took to fill back up to the brim.
export function tankEconomy(distance: number, unit: EconomyUnit, litres: number): TankEconomy | null {
  if (!Number.isFinite(distance) || !Number.isFinite(litres) || distance <= 0 || litres <= 0) return null;
  const miles = unit === "l100km" ? distance / KM_PER_MILE : distance;
  return {
    mpg: miles / (litres / LITRES_PER_UK_GALLON),
    l100km: (litres / (miles * KM_PER_MILE)) * 100,
    usMpg: miles / (litres / LITRES_PER_US_GALLON),
  };
}

// An economy already known in MPG (a fuel log average), in every unit.
export function economyFromMpg(mpg: number): TankEconomy {
  return { mpg, l100km: mpgToL100km(mpg), usMpg: (mpg * LITRES_PER_US_GALLON) / LITRES_PER_UK_GALLON };
}

// MPG and L/100km are reciprocal, not proportional: 282.5 / MPG.
export function mpgToL100km(mpg: number): number {
  return (LITRES_PER_UK_GALLON * 100) / (mpg * KM_PER_MILE);
}

export function l100kmToMpg(l100km: number): number {
  return (LITRES_PER_UK_GALLON * 100) / (l100km * KM_PER_MILE);
}

// The trip already typed in, in the other unit, when the toggle flips.
export function convertDistance(distance: number, from: EconomyUnit, to: EconomyUnit): number {
  if (from === to) return distance;
  return to === "l100km" ? distance * KM_PER_MILE : distance / KM_PER_MILE;
}

// What the fuel costs per mile (MPG) or per 100 km (L/100km), in the same
// money as pricePerLitre.
export function fuelCostPerDistance(pricePerLitre: number, economy: TankEconomy, unit: EconomyUnit): number {
  return unit === "l100km" ? pricePerLitre * economy.l100km : (pricePerLitre * LITRES_PER_UK_GALLON) / economy.mpg;
}
