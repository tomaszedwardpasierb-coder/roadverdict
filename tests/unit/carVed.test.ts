import { describe, expect, it } from "vitest";
import { getCarVed, CAR_VED_STANDARD_RATE } from "@/lib/tracker/carVed";

describe("getCarVed", () => {
  it("returns the honest 'unknown' shape when co2Gkm is absent", () => {
    const result = getCarVed(undefined);
    expect(result.unknown).toBe(true);
  });

  it("returns 'unknown' for a negative or non-finite co2Gkm rather than a wrong number", () => {
    expect(getCarVed(-5).unknown).toBe(true);
    expect(getCarVed(NaN).unknown).toBe(true);
  });

  it("bands a zero-emission car (an EV) into the £10 first-year rate", () => {
    const result = getCarVed(0);
    expect(result).toEqual({ firstYear: 10, standard: 200 });
  });

  it("bands a typical small petrol car correctly", () => {
    expect(getCarVed(45)).toEqual({ firstYear: 115, standard: 200 });
  });

  it("bands right at a boundary (75g/km, inclusive) into the lower band", () => {
    expect(getCarVed(75).unknown).not.toBe(true);
    expect((getCarVed(75) as { firstYear: number }).firstYear).toBe(135);
  });

  it("bands just past a boundary (76g/km) into the next band up", () => {
    expect((getCarVed(76) as { firstYear: number }).firstYear).toBe(280);
  });

  it("bands a high-emission car into the top £5,690 band", () => {
    expect((getCarVed(260) as { firstYear: number }).firstYear).toBe(5690);
  });

  it("uses the same flat standard rate regardless of CO2 band", () => {
    expect((getCarVed(0) as { standard: number }).standard).toBe(CAR_VED_STANDARD_RATE);
    expect((getCarVed(260) as { standard: number }).standard).toBe(CAR_VED_STANDARD_RATE);
  });
});
