import { describe, expect, it } from "vitest";
import {
  ALL_BRANDS,
  MOTORCYCLE_MODELS,
  getBikeClassForCC,
  getModelsForBrand,
  slugifyMake,
} from "@/lib/motorcycleModels";

describe("slugifyMake", () => {
  it("lowercases a single-word make", () => {
    expect(slugifyMake("Honda")).toBe("honda");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugifyMake("Royal Enfield")).toBe("royal-enfield");
  });

  it("lowercases a make that already contains a hyphen", () => {
    expect(slugifyMake("Harley-Davidson")).toBe("harley-davidson");
  });

  it("collapses multiple internal spaces to a single hyphen", () => {
    expect(slugifyMake("Some  Brand")).toBe("some-brand");
  });
});

describe("getModelsForBrand", () => {
  it("returns only models for the requested brand", () => {
    const models = getModelsForBrand("honda");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.make === "Honda")).toBe(true);
  });

  it("resolves multi-word brand slugs", () => {
    const models = getModelsForBrand("royal-enfield");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.make === "Royal Enfield")).toBe(true);
  });

  it("resolves hyphenated brand names", () => {
    const models = getModelsForBrand("harley-davidson");
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.make === "Harley-Davidson")).toBe(true);
  });

  it("returns an empty array for an unknown brand slug", () => {
    expect(getModelsForBrand("not-a-real-brand")).toEqual([]);
  });

  it("is case-sensitive to the slug (does not match on the un-slugified make)", () => {
    expect(getModelsForBrand("Honda")).toEqual([]);
  });
});

describe("getBikeClassForCC", () => {
  it("classes 400cc and below as small", () => {
    expect(getBikeClassForCC(125)).toBe("small");
    expect(getBikeClassForCC(400)).toBe("small");
  });

  it("classes 401-750cc as medium", () => {
    expect(getBikeClassForCC(401)).toBe("medium");
    expect(getBikeClassForCC(649)).toBe("medium");
    expect(getBikeClassForCC(750)).toBe("medium");
  });

  it("classes above 750cc as large", () => {
    expect(getBikeClassForCC(751)).toBe("large");
    expect(getBikeClassForCC(1800)).toBe("large");
  });
});

describe("ALL_BRANDS", () => {
  it("contains no duplicate brand names", () => {
    expect(ALL_BRANDS.length).toBe(new Set(ALL_BRANDS).size);
  });

  it("is sorted alphabetically", () => {
    const sorted = [...ALL_BRANDS].sort();
    expect(ALL_BRANDS).toEqual(sorted);
  });

  it("includes every distinct make present in MOTORCYCLE_MODELS", () => {
    const makesInData = new Set(MOTORCYCLE_MODELS.map((m) => m.make));
    expect(new Set(ALL_BRANDS)).toEqual(makesInData);
  });
});

describe("MOTORCYCLE_MODELS data integrity", () => {
  it("gives every entry a positive engineCC", () => {
    expect(MOTORCYCLE_MODELS.every((m) => typeof m.engineCC === "number" && m.engineCC > 0)).toBe(true);
  });

  it("has every entry retrievable via getModelsForBrand(slugifyMake(make))", () => {
    for (const model of MOTORCYCLE_MODELS) {
      const models = getModelsForBrand(slugifyMake(model.make));
      expect(models).toContainEqual(model);
    }
  });
});
