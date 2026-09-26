import { existsSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

import { BENCHMARKS, getInflationAdjustedBenchmark } from "@/lib/priceData";
import { CAR_BENCHMARKS, getInflationAdjustedCarBenchmark } from "@/lib/carPriceData";
import {
  MOT_MAX_FEE,
  PRICE_GUIDES,
  costFaq,
  findPriceGuide,
  formatPounds,
  lastReviewed,
  overallRange,
  priceGuidePath,
  priceRows,
  quoteCheckerHref,
  type BenchmarkGuide,
  type GuideVehicle,
} from "@/lib/seo/priceGuides";

const vehicles = Object.keys(PRICE_GUIDES) as GuideVehicle[];
const allGuides = vehicles.flatMap((v) => PRICE_GUIDES[v]);
const benchmarkGuides = allGuides.filter((g): g is BenchmarkGuide => g.kind === "benchmark");

describe("price guides", () => {
  it("has unique slugs per vehicle, and every related link resolves to a real guide", () => {
    for (const vehicle of vehicles) {
      const slugs = PRICE_GUIDES[vehicle].map((g) => g.slug);
      expect(new Set(slugs).size, vehicle).toBe(slugs.length);
      for (const guide of PRICE_GUIDES[vehicle]) {
        for (const rel of guide.related) {
          expect(findPriceGuide(vehicle, rel), `${vehicle}/${guide.slug} -> ${rel}`).toBeDefined();
        }
      }
    }
  });

  it("publishes a guide for every job the price data covers - and none for jobs it doesn't", () => {
    const carJobs = benchmarkGuides.filter((g) => g.vehicle === "car").map((g) => g.job).sort();
    const bikeJobs = benchmarkGuides.filter((g) => g.vehicle === "motorcycle").map((g) => g.job).sort();
    expect(carJobs).toEqual(Object.keys(CAR_BENCHMARKS).sort());
    expect(bikeJobs).toEqual(Object.keys(BENCHMARKS).sort());
  });

  it("takes every price straight from the sourced benchmark tables", () => {
    for (const guide of benchmarkGuides) {
      for (const row of priceRows(guide)) {
        const source =
          guide.vehicle === "car"
            ? getInflationAdjustedCarBenchmark(guide.job, row.size as "small" | "medium" | "large")
            : getInflationAdjustedBenchmark(guide.job, row.size as "small" | "medium" | "large");
        expect([row.low, row.high], `${guide.vehicle}/${guide.slug}/${row.size}`).toEqual([source.low, source.high]);
        expect(row.sourceName.length).toBeGreaterThan(0);
      }
    }
  });

  it("answers the headline question from the same numbers the table shows", () => {
    for (const guide of benchmarkGuides) {
      const faq = costFaq(guide);
      expect(faq.q).toBe(guide.h1);
      for (const row of priceRows(guide)) {
        expect(faq.a).toContain(`${formatPounds(row.low)}-${formatPounds(row.high)}`);
      }
    }
  });

  it("states the legal MOT caps from GOV.UK", () => {
    const car = findPriceGuide("car", "mot")!;
    const bike = findPriceGuide("motorcycle", "mot")!;
    expect(costFaq(car).a).toContain("£54.85");
    expect(costFaq(bike).a).toContain("£29.65");
    expect(costFaq(bike).a).toContain("£37.80");
    expect(MOT_MAX_FEE).toEqual({ car: 54.85, motorcycle: 29.65, motorcycleWithSidecar: 37.8 });
    expect(overallRange(car)).toEqual({ low: 54.85, high: 54.85 });
  });

  it("links into the matching quote checker with the job and size pre-selected", () => {
    const carTyres = findPriceGuide("car", "tyres") as BenchmarkGuide;
    expect(quoteCheckerHref(carTyres, "large")).toBe("/cars/quote-checker?job=tyres-front-pair&size=large");
    const bikeChain = findPriceGuide("motorcycle", "chain-and-sprockets") as BenchmarkGuide;
    expect(quoteCheckerHref(bikeChain)).toBe("/quote-checker?job=chain-and-sprockets");
  });

  it("keeps titles and descriptions short enough to show in full in search results", () => {
    for (const guide of allGuides) {
      expect(`${guide.title} | RoadVerdict`.length, guide.title).toBeLessThanOrEqual(75);
      expect(guide.description.length, guide.slug).toBeGreaterThanOrEqual(90);
      expect(guide.description.length, guide.slug).toBeLessThanOrEqual(170);
    }
  });

  it("dates every page from its underlying data", () => {
    for (const guide of allGuides) {
      expect(lastReviewed(guide), `${guide.vehicle}/${guide.slug}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("has a real route behind every guide path", () => {
    for (const guide of allGuides) {
      const route = priceGuidePath(guide).replace(/\/[^/]+$/, "/[slug]");
      expect(existsSync(path.join(process.cwd(), "src/app", route, "page.tsx")), route).toBe(true);
    }
  });
});
