// Place at: tests/unit/carModels.test.ts
import { describe, expect, it } from "vitest";
import { ALL_CAR_BRANDS, CAR_MODELS } from "@/lib/carModels";

describe("ALL_CAR_BRANDS", () => {
  it("contains no duplicate brand names", () => {
    expect(ALL_CAR_BRANDS.length).toBe(new Set(ALL_CAR_BRANDS).size);
  });

  it("is sorted alphabetically", () => {
    const sorted = [...ALL_CAR_BRANDS].sort();
    expect(ALL_CAR_BRANDS).toEqual(sorted);
  });

  it("includes every distinct make present in CAR_MODELS", () => {
    const makesInData = new Set(CAR_MODELS.map((m) => m.make));
    expect(new Set(ALL_CAR_BRANDS)).toEqual(makesInData);
  });

  it("has a genuinely substantial number of brands, not a token handful", () => {
    expect(ALL_CAR_BRANDS.length).toBeGreaterThan(30);
  });
});

describe("CAR_MODELS data integrity", () => {
  it("gives every entry a non-empty make and model", () => {
    expect(CAR_MODELS.every((m) => m.make.trim().length > 0 && m.model.trim().length > 0)).toBe(true);
  });

  it("has no duplicate model name within the same make", () => {
    const seen = new Set<string>();
    for (const m of CAR_MODELS) {
      const key = `${m.make}::${m.model}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("has a genuinely substantial number of models, not a token handful", () => {
    expect(CAR_MODELS.length).toBeGreaterThan(300);
  });
});
