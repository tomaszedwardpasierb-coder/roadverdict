// Place at: src/lib/tracker/fuelPlausibility.ts
//
// Deliberately one-directional and deliberately crude compared to the
// adaptive MPG anomaly detector in mpgCalc.ts. That detector compares a
// segment to THIS rider's own baseline, and only catches "too far for
// too little fuel" (a likely missed fill-up) - a judgement call that
// genuinely depends on how this particular person rides. This check is
// the other direction: "too little distance for this much fuel", which
// has a hard physical floor no petrol motorcycle can beat regardless of
// riding style, so it's safe to apply as an absolute rule from the very
// first fill-up, before there's any rider history to build a baseline from.

export interface FuelFillCheckResult {
  plausible: boolean;
  actualMiles: number;
  minPlausibleMiles: number;
  impliedMpg: number;
  precedingMileage: number;
}

// Generously low on purpose - almost no real UK motorcycle does worse
// than this even in the worst conditions, so this essentially only
// fires on genuinely broken data (wrong mileage, or a full-tank tick
// that should have been a top-up), not on a real thirsty bike having a
// rough week.
const MIN_PLAUSIBLE_MPG = 15;

// Only meaningful for a genuine full-tank fill - a partial top-up can
// legitimately happen after any distance, including a very short one
// (topping off before a trip is completely normal), so this is never
// applied to those.
export function checkFullTankPlausibility(
  litres: number,
  mileage: number,
  precedingTrustedFuelLogs: { mileage: number }[]
): FuelFillCheckResult | null {
  const preceding = [...precedingTrustedFuelLogs].filter((f) => f.mileage < mileage).sort((a, b) => b.mileage - a.mileage)[0];
  if (!preceding) return null;

  const actualMiles = mileage - preceding.mileage;
  const gallons = litres / 4.546;
  const minPlausibleMiles = gallons * MIN_PLAUSIBLE_MPG;
  const impliedMpg = actualMiles > 0 ? actualMiles / gallons : 0;

  return {
    plausible: actualMiles >= minPlausibleMiles,
    actualMiles,
    minPlausibleMiles,
    impliedMpg,
    precedingMileage: preceding.mileage,
  };
}

export function describeImplausibleFill(check: FuelFillCheckResult, litres: number): string {
  return `${litres.toFixed(1)}L for a full tank after only ${Math.round(check.actualMiles)} miles works out to about ${Math.round(check.impliedMpg)} mpg, which isn't realistic for a petrol engine. The mileage should be at least ${Math.round(check.precedingMileage + check.minPlausibleMiles).toLocaleString()} for this to add up - please check it, or untick "filled to full" if this was actually a smaller top-up.`;
}
