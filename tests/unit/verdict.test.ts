import { describe, expect, it } from "vitest";
import { computeVerdict } from "@/lib/verdict";

describe("computeVerdict", () => {
  const range = { low: 80, high: 100 };

  it("is fair for a price within the typical range", () => {
    expect(computeVerdict(90, range)).toBe("fair");
  });

  it("is fair for a price exactly at the top of the range", () => {
    expect(computeVerdict(100, range)).toBe("fair");
  });

  // No check against range.low at all - a price below the typical range
  // is still "fair", not flagged as suspiciously cheap. There's no
  // fourth verdict value for that in the type at all. Documenting the
  // real current behaviour, not asserting it's the right call.
  it("is fair for a price below the typical range too - there's no 'suspiciously low' verdict", () => {
    expect(computeVerdict(20, range)).toBe("fair");
  });

  it("is high for a price just over the top of the range", () => {
    expect(computeVerdict(101, range)).toBe("high");
  });

  // The exact threshold: overBy <= 0.3 is "high", so 30% over lands on
  // the "high" side of the boundary, not "second-opinion".
  it("is high exactly at the 30% threshold, not second-opinion", () => {
    expect(computeVerdict(130, range)).toBe("high");
  });

  it("is second-opinion just past the 30% threshold", () => {
    expect(computeVerdict(130.01, range)).toBe("second-opinion");
  });

  it("is second-opinion for a price well above the range", () => {
    expect(computeVerdict(250, range)).toBe("second-opinion");
  });
});