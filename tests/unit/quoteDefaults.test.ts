import { describe, expect, it } from "vitest";

import { bikeQuoteDefaults, carClassFromEngineLitres, carQuoteDefaults } from "@/lib/tracker/quoteDefaults";
import { getBikeClassForCC } from "@/lib/motorcycleModels";

describe("quote checker defaults for an owner's own vehicle", () => {
  it("uses a bike's make when the checker lists it, and sizes it by engine", () => {
    const d = bikeQuoteDefaults({ make: "Honda", model: "CB500F", engineCC: 471 });
    expect(d.brand).toBe("honda");
    expect(d.bikeClass).toBe(getBikeClassForCC(471));
  });

  it("falls back to 'other' for a make the checker doesn't list", () => {
    expect(bikeQuoteDefaults({ make: "Zontes", model: "350T", engineCC: 348 }).brand).toBe("other");
  });

  it("sizes a car by engine litres, the same bands as the web", () => {
    expect(carClassFromEngineLitres(1.0)).toBe("small");
    expect(carClassFromEngineLitres(1.2)).toBe("small");
    expect(carClassFromEngineLitres(1.6)).toBe("medium");
    expect(carClassFromEngineLitres(2.0)).toBe("medium");
    expect(carClassFromEngineLitres(3.0)).toBe("large");
  });

  it("leaves an electric car, or one with no engine size, unsized", () => {
    expect(carQuoteDefaults({ make: "BMW", fuelType: "electric", engineLitres: undefined }).carClass).toBeUndefined();
    expect(carQuoteDefaults({ make: "BMW", fuelType: "petrol", engineLitres: undefined }).carClass).toBeUndefined();
    expect(carQuoteDefaults({ make: "BMW", fuelType: "petrol", engineLitres: 3.0 }).carClass).toBe("large");
  });
});
