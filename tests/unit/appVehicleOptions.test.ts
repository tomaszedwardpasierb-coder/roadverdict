import { describe, expect, it } from "vitest";

import { getVehicleOptions } from "@/lib/app/vehicleOptions";
import { ALL_BRANDS, MOTORCYCLE_MODELS } from "@/lib/motorcycleModels";
import { ALL_CAR_BRANDS, CAR_MODELS } from "@/lib/carModels";
import { REGION_LABELS } from "@/lib/priceData";
import { ALL_CURRENCIES, CURRENCY_LABELS } from "@/lib/tracker/currency";
import { GET } from "@/app/api/app/vehicle-options/route";

const options = getVehicleOptions();

describe("app vehicle options", () => {
  it("offers the web forms' own make and model lists, in full", () => {
    expect(options.bike.makes).toEqual(ALL_BRANDS);
    expect(options.bike.models).toHaveLength(MOTORCYCLE_MODELS.length);
    expect(options.car.makes).toEqual(ALL_CAR_BRANDS);
    expect(options.car.models).toHaveLength(CAR_MODELS.length);
  });

  it("gives every bike model its engine size, and every model a listed make", () => {
    for (const m of options.bike.models) {
      expect(m.engineCC).toBeGreaterThan(0);
      expect(options.bike.makes).toContain(m.make);
    }
    for (const m of options.car.models) expect(options.car.makes).toContain(m.make);
  });

  it("offers the five car fuel types the car routes accept, and the web's regions", () => {
    expect(options.car.fuelTypes.map((f) => f.value)).toEqual(["petrol", "diesel", "hybrid", "phev", "electric"]);
    expect(options.regions.map((r) => r.value).sort()).toEqual(Object.keys(REGION_LABELS).sort());
    expect(options.regions.map((r) => r.value)).toContain(options.defaultRegion);
  });

  it("offers every currency the unit settings accept, with the web's labels", () => {
    expect(options.currencies.map((c) => c.value)).toEqual(ALL_CURRENCIES);
    for (const c of options.currencies) expect(c.label).toBe(CURRENCY_LABELS[c.value]);
  });

  it("is served publicly and cached, like the logging-form options", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await res.json()).toEqual(options);
  });
});
