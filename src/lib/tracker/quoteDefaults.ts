// Place at: src/lib/tracker/quoteDefaults.ts
//
// Where the quote checker starts for a signed-in owner's own vehicle: its
// make as one of the checker's brand options ("other" when it isn't one)
// and its size class. Shared by /api/viewer (the web's quote forms) and
// the Android app's quote screen, so both start from the same answer.
import type { BikeDoc } from "@/lib/tracker/bike";
import type { CarDoc } from "@/lib/tracker/car";
import { BRAND_OPTIONS, type BikeClass } from "@/lib/priceData";
import { getBikeClassForCC, getModelsForBrand, slugifyMake } from "@/lib/motorcycleModels";
import { CAR_BRAND_OPTIONS, slugifyCarMake, type CarBenchmarkClass } from "@/lib/carPriceData";

export function carClassFromEngineLitres(engineLitres: number): CarBenchmarkClass {
  if (engineLitres <= 1.2) return "small";
  if (engineLitres <= 2.0) return "medium";
  return "large";
}

export function bikeQuoteDefaults(bike: Pick<BikeDoc, "make" | "model" | "engineCC">): { brand: string; bikeClass: BikeClass; model?: string } {
  const slug = slugifyMake(bike.make);
  const brand = BRAND_OPTIONS.some((b) => b.value === slug) ? slug : "other";
  const modelLower = bike.model.toLowerCase();
  const matched = getModelsForBrand(brand).find(
    (m) => m.model.toLowerCase().includes(modelLower) || modelLower.includes(m.model.toLowerCase())
  );
  return { brand, bikeClass: getBikeClassForCC(bike.engineCC), model: matched?.model };
}

// No size class for an electric car (no engine to size it by) or one
// logged without an engine size - the form keeps its own default then.
export function carQuoteDefaults(car: Pick<CarDoc, "make" | "fuelType" | "engineLitres">): { brand: string; carClass?: CarBenchmarkClass } {
  const slug = slugifyCarMake(car.make);
  return {
    brand: CAR_BRAND_OPTIONS.some((b) => b.value === slug) ? slug : "other",
    carClass: car.fuelType !== "electric" && car.engineLitres ? carClassFromEngineLitres(car.engineLitres) : undefined,
  };
}
