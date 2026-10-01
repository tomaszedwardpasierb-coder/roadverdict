import { describe, expect, it } from "vitest";
import { MAX_FREE_VEHICLES, MAX_GRANTED_VEHICLES, MAX_PRO_VEHICLES, vehicleLimitFor } from "@/lib/tracker/vehicleLimit";

describe("vehicleLimitFor", () => {
  it("is the plan's own cap without an allowance", () => {
    expect(vehicleLimitFor(false)).toBe(MAX_FREE_VEHICLES);
    expect(vehicleLimitFor(true)).toBe(MAX_PRO_VEHICLES);
    expect(vehicleLimitFor(true, null)).toBe(MAX_PRO_VEHICLES);
  });

  it("raises the cap to an admin allowance, on any plan", () => {
    expect(vehicleLimitFor(true, 3)).toBe(3);
    expect(vehicleLimitFor(true, 4)).toBe(4);
    expect(vehicleLimitFor(false, 3)).toBe(3);
  });

  it("never lowers the plan's own cap", () => {
    expect(vehicleLimitFor(true, 1)).toBe(MAX_PRO_VEHICLES);
    expect(vehicleLimitFor(false, 0)).toBe(MAX_FREE_VEHICLES);
  });

  it("never goes past the most any account can have", () => {
    expect(MAX_GRANTED_VEHICLES).toBe(4);
    expect(vehicleLimitFor(true, 10)).toBe(4);
  });

  it("ignores an allowance that isn't a whole number", () => {
    expect(vehicleLimitFor(true, 3.5)).toBe(MAX_PRO_VEHICLES);
    expect(vehicleLimitFor(true, Number.NaN)).toBe(MAX_PRO_VEHICLES);
  });
});

describe("vehicleLimitFor with paid extra vehicles", () => {
  it("adds paid extra vehicles on top of Pro's cap", () => {
    expect(vehicleLimitFor(true, null, 1)).toBe(3);
    expect(vehicleLimitFor(true, null, 2)).toBe(4);
  });

  it("ignores paid extra vehicles once Pro has lapsed", () => {
    expect(vehicleLimitFor(false, null, 2)).toBe(MAX_FREE_VEHICLES);
  });

  it("takes the higher of paid extras and an admin allowance, never past 4", () => {
    expect(vehicleLimitFor(true, 3, 1)).toBe(3);
    expect(vehicleLimitFor(true, 4, 2)).toBe(4);
    expect(vehicleLimitFor(true, null, 5)).toBe(4);
  });
});
