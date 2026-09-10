// Place at: src/lib/tracker/carStoryFacts.ts
//
// Car equivalent of storyFacts.ts - but only computeCarIdentity actually
// needs a car-specific version. computeCategorySpend/computeServiceRhythm/
// computeMpgTrend are reused directly from storyFacts.ts: all three take
// genuinely generic, vehicle-neutral shapes (plain {category, cost}[]
// rows, plain {date}[] records, and computeMPGSeries' own already-shared
// MpgCalcInput), with no BikeDoc coupling anywhere in their signatures.
// jobLabel isn't mirrored either - it's dead within this pipeline (never
// imported by storyProse.ts or the API route), so there's nothing to
// carry over.

import type { CarDoc } from "@/lib/tracker/car";

export interface CarIdentity {
  make: string;
  model: string;
  year?: number;
  currentMileage: number;
  loggedSinceDate: string;
  loggedSpanYears: number;
  totalLoggedEvents: number;
}

export function computeCarIdentity(
  car: Pick<CarDoc, "make" | "model" | "year" | "currentMileage" | "dateAdded">,
  totalLoggedEvents: number
): CarIdentity {
  const loggedSpanYears = (Date.now() - new Date(car.dateAdded).getTime()) / (86_400_000 * 365);
  return {
    make: car.make,
    model: car.model,
    year: car.year,
    currentMileage: car.currentMileage,
    loggedSinceDate: car.dateAdded,
    loggedSpanYears,
    totalLoggedEvents,
  };
}
