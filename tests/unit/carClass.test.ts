import { describe, expect, it } from "vitest";
import { getCarSizeClass } from "@/lib/tracker/carClass";

describe("getCarSizeClass", () => {
  it("returns 'electric' for an electric car regardless of any engineLitres figure supplied", () => {
    expect(getCarSizeClass(2.0, "electric")).toBe("electric");
    expect(getCarSizeClass(undefined, "electric")).toBe("electric");
  });

  it("returns 'small' at or below 1.2 litres", () => {
    expect(getCarSizeClass(1.0, "petrol")).toBe("small");
    expect(getCarSizeClass(1.2, "diesel")).toBe("small");
  });

  it("returns 'medium' between 1.2 and 2.0 litres inclusive", () => {
    expect(getCarSizeClass(1.6, "petrol")).toBe("medium");
    expect(getCarSizeClass(2.0, "hybrid")).toBe("medium");
  });

  it("returns 'large' above 2.0 litres", () => {
    expect(getCarSizeClass(3.0, "diesel")).toBe("large");
  });

  it("falls back to 'medium' rather than blocking when engineLitres is missing for a non-electric car", () => {
    expect(getCarSizeClass(undefined, "petrol")).toBe("medium");
    expect(getCarSizeClass(undefined, "phev")).toBe("medium");
  });
});
