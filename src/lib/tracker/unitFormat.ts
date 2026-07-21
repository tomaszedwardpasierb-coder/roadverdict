// Place at: src/lib/tracker/unitFormat.ts

export type DistanceUnit = "mi" | "km";
export type FuelEconomyUnit = "mpg" | "l100km";

const KM_PER_MILE = 1.60934;
const LITRES_PER_UK_GALLON = 4.546;

// Canonical storage is always miles / UK mpg - these functions only
// ever affect what's shown or entered on screen, never what's saved.

export function convertMilesToDisplay(miles: number, unit: DistanceUnit): number {
  return unit === "km" ? miles * KM_PER_MILE : miles;
}

export function convertDisplayToMiles(value: number, unit: DistanceUnit): number {
  return unit === "km" ? value / KM_PER_MILE : value;
}

export function formatDistance(miles: number, unit: DistanceUnit): string {
  const value = convertMilesToDisplay(miles, unit);
  return `${Math.round(value).toLocaleString()} ${unit === "km" ? "km" : "miles"}`;
}

export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === "km" ? "km" : "miles";
}

// MPG and L/100km are reciprocally related, not linearly - this is a
// real formula, not a relabel.
export function formatFuelEconomy(mpg: number, unit: FuelEconomyUnit): string {
  if (unit === "l100km") {
    const l100km = (LITRES_PER_UK_GALLON * 100) / (mpg * KM_PER_MILE);
    return `${l100km.toFixed(1)} L/100km`;
  }
  return `${mpg.toFixed(1)} mpg`;
}

export function formatCostPerDistance(pencePerMile: number, unit: DistanceUnit): string {
  const value = unit === "km" ? pencePerMile / KM_PER_MILE : pencePerMile;
  return `${value.toFixed(1)}p`;
}
