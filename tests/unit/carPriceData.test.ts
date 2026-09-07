import { describe, expect, it } from "vitest";
import {
  CAR_BRAND_OPTIONS,
  CAR_BENCHMARKS,
  CAR_JOB_LABELS_BENCHMARKED,
  CAR_SIZE_CLASS_LABELS,
  getCarBenchmark,
  getCarBrandTier,
  getAdjustedCarBenchmark,
  slugifyCarMake,
} from "@/lib/carPriceData";
import { ALL_CAR_BRANDS } from "@/lib/carModels";

describe("CAR_BRAND_OPTIONS", () => {
  it("has no duplicate brand values", () => {
    const values = CAR_BRAND_OPTIONS.map((b) => b.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("covers every brand in carModels.ts's ALL_CAR_BRANDS, once slugified", () => {
    for (const make of ALL_CAR_BRANDS) {
      const slug = slugifyCarMake(make);
      expect(CAR_BRAND_OPTIONS.some((b) => b.value === slug), `missing brand option for ${make} (${slug})`).toBe(true);
    }
  });

  it("has a safe 'other' fallback", () => {
    expect(CAR_BRAND_OPTIONS.some((b) => b.value === "other")).toBe(true);
  });
});

describe("slugifyCarMake", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugifyCarMake("Land Rover")).toBe("land-rover");
    expect(slugifyCarMake("Mercedes-Benz")).toBe("mercedes-benz");
  });

  it("strips diacritics so accented makes match their CAR_BRAND_OPTIONS value", () => {
    expect(slugifyCarMake("Škoda")).toBe("skoda");
    expect(slugifyCarMake("Citroën")).toBe("citroen");
  });
});

describe("getCarBenchmark / CAR_BENCHMARKS", () => {
  it("covers all 5 benchmarked job types for all 3 sizes (no 'electric' key - see the ADR's Phase 7 scope cut)", () => {
    for (const job of Object.keys(CAR_JOB_LABELS_BENCHMARKED) as (keyof typeof CAR_BENCHMARKS)[]) {
      for (const carClass of Object.keys(CAR_SIZE_CLASS_LABELS) as ("small" | "medium" | "large")[]) {
        const benchmark = getCarBenchmark(job, carClass);
        expect(benchmark.low).toBeGreaterThan(0);
        expect(benchmark.high).toBeGreaterThanOrEqual(benchmark.low);
        expect(benchmark.source.sourceName).toBeTruthy();
      }
    }
    expect((CAR_BENCHMARKS["full-service"] as Record<string, unknown>).electric).toBeUndefined();
  });

  it("prices a large car's full-service higher than a small car's", () => {
    const small = getCarBenchmark("full-service", "small");
    const large = getCarBenchmark("full-service", "large");
    expect(large.low).toBeGreaterThan(small.low);
  });
});

describe("getCarBrandTier", () => {
  it("returns the tier for a known brand", () => {
    expect(getCarBrandTier("bmw")).toBe("premium");
    expect(getCarBrandTier("dacia")).toBe("budget");
    expect(getCarBrandTier("ford")).toBe("mainstream");
  });

  it("falls back to mainstream for an unrecognised brand value", () => {
    expect(getCarBrandTier("not-a-real-brand")).toBe("mainstream");
  });
});

describe("getAdjustedCarBenchmark", () => {
  it("prices a premium brand higher than a mainstream one for the same job/size/region", () => {
    const mainstream = getAdjustedCarBenchmark("full-service", "medium", "ford", "rest-england-wales");
    const premium = getAdjustedCarBenchmark("full-service", "medium", "bmw", "rest-england-wales");
    expect(premium.low).toBeGreaterThan(mainstream.low);
  });

  it("prices London & South East higher than Scotland & Northern Ireland for the same job/size/brand", () => {
    const londonSe = getAdjustedCarBenchmark("full-service", "medium", "ford", "london-se");
    const scotlandNi = getAdjustedCarBenchmark("full-service", "medium", "ford", "scotland-ni");
    expect(londonSe.low).toBeGreaterThan(scotlandNi.low);
  });

  it("carries the underlying benchmark's source through unchanged", () => {
    const base = getCarBenchmark("brake-pads-front", "medium");
    const adjusted = getAdjustedCarBenchmark("brake-pads-front", "medium", "ford", "rest-england-wales");
    expect(adjusted.source).toBe(base.source);
  });
});
