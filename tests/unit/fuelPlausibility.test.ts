import { describe, expect, it } from "vitest";
import { checkFullTankPlausibility, checkLitresPlausibility } from "@/lib/tracker/fuelPlausibility";

describe("fuel plausibility", () => {
  it("returns no full-tank comparison without a preceding fill", () => {
    expect(checkFullTankPlausibility(15, 1000, [])).toBeNull();
  });

  it("flags a large fill after too little distance", () => {
    const result = checkFullTankPlausibility(16, 1010, [{ mileage: 1000 }]);
    expect(result?.plausible).toBe(false);
  });

  it("rejects fuel beyond the known tank capacity", () => {
    expect(checkLitresPlausibility(20, 15).implausible).toBe(true);
    expect(checkLitresPlausibility(15, 15).implausible).toBe(false);
  });
});