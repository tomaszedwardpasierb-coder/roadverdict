import { describe, expect, it } from "vitest";

import { getBuyingOptions } from "@/lib/app/buyingOptions";
import { buyingGuideRequestSchema, carBuyingGuideRequestSchema } from "@/lib/validation";
import { GET } from "@/app/api/app/buying-options/route";

const options = getBuyingOptions();

describe("app buying-guide options", () => {
  it("offers only choices the bike checklist route accepts", () => {
    for (const brand of options.bike.brands)
      for (const bikeClass of options.bike.classes)
        for (const ageBand of options.bike.ageBands) {
          expect(buyingGuideRequestSchema.safeParse({ brand: brand.value, bikeClass: bikeClass.value, ageBand: ageBand.value }).success).toBe(true);
        }
  });

  it("offers only choices the car checklist route accepts, electric included", () => {
    expect(options.car.classes.map((c) => c.value)).toContain("electric");
    for (const brand of options.car.brands)
      for (const carClass of options.car.classes)
        for (const ageBand of options.car.ageBands) {
          expect(carBuyingGuideRequestSchema.safeParse({ brand: brand.value, carClass: carClass.value, ageBand: ageBand.value }).success).toBe(true);
        }
  });

  it("is served publicly and cached, like the other option lists", async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await res.json()).toEqual(options);
  });
});
