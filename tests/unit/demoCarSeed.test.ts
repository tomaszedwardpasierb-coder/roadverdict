import { describe, expect, it } from "vitest";
import {
  generateDemoCarDataset,
  DEMO_CAR_MAKE,
  DEMO_CAR_MODEL,
  DEMO_CAR_REGISTRATION,
  DEMO_CAR_YEAR,
} from "@/lib/tracker/demoCarSeed";

// Mirrors demoSeed.test.ts's own structure and reasoning exactly -
// generateDemoCarDataset uses a fixed seed (mulberry32(43)), so the
// output is fully deterministic. These lock down shape and invariants,
// not exact values, so they survive benchmark-pricing changes but catch
// accidental changes to the generation logic itself.

describe("generateDemoCarDataset", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const dataset = generateDemoCarDataset(now);

  // ── Exported constants ──────────────────────────────────────────────

  it("exports the expected demo car account constants", () => {
    expect(DEMO_CAR_MAKE).toBe("BMW");
    expect(DEMO_CAR_MODEL).toBe("640i Gran Coupe");
    expect(DEMO_CAR_REGISTRATION).toBe("PA63 ERB");
    expect(DEMO_CAR_YEAR).toBe(2013);
  });

  // ── Dataset shape ───────────────────────────────────────────────────

  it("returns all expected top-level keys", () => {
    expect(dataset).toHaveProperty("fuel");
    expect(dataset).toHaveProperty("service");
    expect(dataset).toHaveProperty("mods");
    expect(dataset).toHaveProperty("bills");
    expect(dataset).toHaveProperty("finalMileage");
  });

  it("generates a non-trivial number of fuel entries (covers 10 years)", () => {
    expect(dataset.fuel.length).toBeGreaterThan(100);
  });

  it("generates exactly 10 annual interim/full service entries", () => {
    const annualServices = dataset.service.filter((s) => s.jobType === "interim-service" || s.jobType === "full-service");
    expect(annualServices.length).toBe(10);
  });

  it("includes tyre changes among the service entries", () => {
    const tyreJobs = dataset.service.filter((s) => s.jobType.startsWith("tyres-"));
    expect(tyreJobs.length).toBeGreaterThan(0);
  });

  it("generates at least some mods", () => {
    expect(dataset.mods.length).toBeGreaterThan(0);
  });

  it("generates bills including insurance, road tax, and MOT", () => {
    const billTypes = dataset.bills.map((b) => b.billType);
    expect(billTypes).toContain("insurance");
    expect(billTypes).toContain("road-tax");
    expect(billTypes).toContain("mot-test");
  });

  // ── Determinism ─────────────────────────────────────────────────────

  it("produces the same dataset on repeated calls with the same date", () => {
    const a = generateDemoCarDataset(now);
    const b = generateDemoCarDataset(now);
    expect(a.fuel.length).toBe(b.fuel.length);
    expect(a.service.length).toBe(b.service.length);
    expect(a.finalMileage).toBe(b.finalMileage);
    expect(a.fuel[0]).toEqual(b.fuel[0]);
  });

  it("produces a different dataset when called with a different date", () => {
    const other = generateDemoCarDataset(new Date("2025-01-01T00:00:00.000Z"));
    expect(dataset.fuel[0].date).not.toBe(other.fuel[0].date);
  });

  // ── Date ordering ────────────────────────────────────────────────────

  it("fuel entries are sorted oldest to newest", () => {
    for (let i = 1; i < dataset.fuel.length; i++) {
      expect(dataset.fuel[i].date >= dataset.fuel[i - 1].date).toBe(true);
    }
  });

  // ── Mileage consistency ──────────────────────────────────────────────

  // Bought used (mayHavePriorHistory), not tracked from new - every
  // mileage figure should sit above the base offset, not start at zero.
  it("all fuel entries have mileage above the pre-tracking base offset", () => {
    expect(dataset.fuel.every((f) => f.mileage > 20_000)).toBe(true);
  });

  it("all service entries have positive mileage above the base offset", () => {
    expect(dataset.service.every((s) => s.mileage > 20_000)).toBe(true);
  });

  it("finalMileage is greater than zero", () => {
    expect(dataset.finalMileage).toBeGreaterThan(0);
  });

  it("finalMileage is greater than the last service mileage", () => {
    const lastService = dataset.service[dataset.service.length - 1];
    expect(dataset.finalMileage).toBeGreaterThan(lastService.mileage);
  });

  // ── Cost sanity ──────────────────────────────────────────────────────

  it("all fuel entries have positive cost and litres", () => {
    expect(dataset.fuel.every((f) => f.cost > 0 && f.litres > 0)).toBe(true);
  });

  it("all service entries have positive cost", () => {
    expect(dataset.service.every((s) => s.cost > 0)).toBe(true);
  });

  // ── filledToFull ─────────────────────────────────────────────────────

  it("all fuel entries have filledToFull set to true", () => {
    expect(dataset.fuel.every((f) => f.filledToFull === true)).toBe(true);
  });
});
