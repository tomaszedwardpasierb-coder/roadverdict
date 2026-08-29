import { describe, expect, it } from "vitest";
import { checkFullTankPlausibility, checkLitresPlausibility, describeImplausibleFill } from "@/lib/tracker/fuelPlausibility";

describe("fuel plausibility", () => {
  it("returns no full-tank comparison without a preceding fill", () => {
    expect(checkFullTankPlausibility(15, 1000, [])).toBeNull();
  });

  it("returns no comparison when no trusted log actually precedes this mileage", () => {
    expect(checkFullTankPlausibility(15, 1000, [{ mileage: 1500 }])).toBeNull();
  });

  it("flags a large fill after too little distance", () => {
    const result = checkFullTankPlausibility(16, 1010, [{ mileage: 1000 }]);
    expect(result?.plausible).toBe(false);
  });

  it("is plausible for a fill that implies a realistic mpg", () => {
    const result = checkFullTankPlausibility(15, 1300, [{ mileage: 1000 }]);
    expect(result?.plausible).toBe(true);
  });

  // Confirms it actually picks the CLOSEST preceding log, not just any
  // log below the current mileage - picking the wrong one would badly
  // distort the implied mpg calculation either direction.
  it("picks the closest preceding log when several exist, ignoring ones after the current mileage", () => {
    const result = checkFullTankPlausibility(15, 1300, [
      { mileage: 200 }, // far earlier, would understate implied mpg if picked by mistake
      { mileage: 1000 }, // genuinely closest preceding entry
      { mileage: 2000 }, // after this fill, must not count as "preceding" at all
    ]);
    expect(result?.precedingMileage).toBe(1000);
  });

  it("rejects fuel beyond the known tank capacity", () => {
    expect(checkLitresPlausibility(20, 15).implausible).toBe(true);
    expect(checkLitresPlausibility(15, 15).implausible).toBe(false);
  });

  // The overfill margin (15%) is a real, specific number in the source -
  // worth pinning the exact boundary rather than only testing comfortably
  // inside/outside it.
  it("allows filler-neck headspace up to exactly the 15% overfill margin", () => {
    expect(checkLitresPlausibility(18.4, 16).implausible).toBe(false); // 16 * 1.15
    expect(checkLitresPlausibility(18.5, 16).implausible).toBe(true);
  });

  it("falls back to the default 16L capacity when the bike has none on record, including zero or negative", () => {
    expect(checkLitresPlausibility(20, undefined).implausible).toBe(true);
    expect(checkLitresPlausibility(20, 0).implausible).toBe(true);
    expect(checkLitresPlausibility(20, -5).implausible).toBe(true);
    expect(checkLitresPlausibility(20, 25).implausible).toBe(false); // a genuinely large tank makes it plausible
  });

  it("describeImplausibleFill names the actual litres, miles covered, and implied mpg", () => {
    const check = checkFullTankPlausibility(15, 1010, [{ mileage: 1000 }]);
    const message = describeImplausibleFill(check!, 15);

    expect(message).toContain("15.0L");
    expect(message).toContain("10 miles");
    expect(message).toMatch(/\d+ mpg/);
  });
});