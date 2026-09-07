// Place at: src/lib/tracker/carClass.ts
//
// The car equivalent of motorcycleModels.ts's getBikeClassForCC - takes
// two axes instead of one (see the ADR: a 1.0L petrol supermini and a
// 2.0L diesel estate don't service the same way, so size alone isn't
// enough the way engine cc alone is for a motorcycle). Replaces
// getBikeClassForCC for car contexts; that function is untouched.
import type { CarFuelType, CarSizeClass } from "./car";

export function getCarSizeClass(engineLitres: number | undefined, fuelType: CarFuelType): CarSizeClass {
  if (fuelType === "electric") return "electric";
  if (!engineLitres) return "medium"; // safe fallback - never blocks on a missing figure
  if (engineLitres <= 1.2) return "small";
  if (engineLitres <= 2.0) return "medium";
  return "large";
}
