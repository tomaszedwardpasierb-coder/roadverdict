// The MPG calculator's maths - the same constants and formulas as the
// website's (src/lib/fuelEconomy.ts there): UK gallons of 4.546 litres and
// 1.60934 km to the mile, so a tank worked out here matches the website
// and the fuel log itself.
export const LITRES_PER_UK_GALLON = 4.546;
export const LITRES_PER_US_GALLON = 3.785411784;
export const KM_PER_MILE = 1.60934;

export type EconomyUnit = 'mpg' | 'l100km';
export type TankEconomy = { mpg: number; l100km: number; usMpg: number };

// One tank: miles (for MPG) or km (for L/100km), and the litres it took.
export function tankEconomy(distance: number, unit: EconomyUnit, litres: number): TankEconomy | null {
  if (!Number.isFinite(distance) || !Number.isFinite(litres) || distance <= 0 || litres <= 0) return null;
  const miles = unit === 'l100km' ? distance / KM_PER_MILE : distance;
  return {
    mpg: miles / (litres / LITRES_PER_UK_GALLON),
    l100km: (litres / (miles * KM_PER_MILE)) * 100,
    usMpg: miles / (litres / LITRES_PER_US_GALLON),
  };
}

export function economyFromMpg(mpg: number): TankEconomy {
  return { mpg, l100km: (LITRES_PER_UK_GALLON * 100) / (mpg * KM_PER_MILE), usMpg: (mpg * LITRES_PER_US_GALLON) / LITRES_PER_UK_GALLON };
}

export function convertDistance(distance: number, from: EconomyUnit, to: EconomyUnit): number {
  if (from === to) return distance;
  return to === 'l100km' ? distance * KM_PER_MILE : distance / KM_PER_MILE;
}

// Fuel cost per mile (MPG) or per 100 km (L/100km), in pricePerLitre's money.
export function fuelCostPerDistance(pricePerLitre: number, economy: TankEconomy, unit: EconomyUnit): number {
  return unit === 'l100km' ? pricePerLitre * economy.l100km : (pricePerLitre * LITRES_PER_UK_GALLON) / economy.mpg;
}

export function formatEconomy(mpg: number, unit: EconomyUnit): string {
  return unit === 'l100km' ? `${economyFromMpg(mpg).l100km.toFixed(1)} L/100km` : `${mpg.toFixed(1)} mpg`;
}

// A comma works as the decimal point too.
export function parseNumber(text: string): number {
  return text.trim() === '' ? NaN : Number(text.trim().replace(',', '.'));
}
