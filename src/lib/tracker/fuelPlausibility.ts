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

import { DEFAULT_TANK_CAPACITY_LITRES } from "./tankGuess";

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

export interface LitresPlausibilityCheck {
  implausible: boolean;
  reason?: string;
}

// A tank physically cannot hold more than its own capacity, plus a
// small margin for filler-neck headspace before genuine overflow. This
// is a different kind of check to everything else in this file - not
// "does the distance add up", just "is this number even physically
// possible for this bike" - which is exactly why it can run before any
// mileage is known at all, unlike the fill-plausibility check above.
const TANK_OVERFILL_MARGIN = 1.15;

export function checkLitresPlausibility(litres: number, tankCapacityLitres?: number): LitresPlausibilityCheck {
  const capacity = tankCapacityLitres && tankCapacityLitres > 0 ? tankCapacityLitres : DEFAULT_TANK_CAPACITY_LITRES;
  if (litres > capacity * TANK_OVERFILL_MARGIN) {
    return {
      implausible: true,
      reason: `${litres.toFixed(1)}L is more than this bike's tank can hold (around ${capacity}L) - please check the figure, it may have been misread from the receipt.`,
    };
  }
  return { implausible: false };
}
