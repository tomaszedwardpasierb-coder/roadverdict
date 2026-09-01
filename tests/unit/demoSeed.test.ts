import { describe, expect, it } from "vitest";
import { generateDemoDataset, DEMO_EMAIL, DEMO_MAKE, DEMO_MODEL, DEMO_REGISTRATION } from "@/lib/tracker/demoSeed";

// generateDemoDataset uses a fixed seed (mulberry32(42)) — the output
// is completely deterministic. These tests lock down the shape and
// key invariants of the generated dataset rather than exact values,
// so they won't break if pricing benchmarks change but WILL catch
// accidental changes to the generation logic.

describe("generateDemoDataset", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const dataset = generateDemoDataset(now);

  // ── Exported constants ──────────────────────────────────────────────

  it("exports the expected demo account constants", () => {
    expect(DEMO_EMAIL).toBe("demo@roadverdict.co.uk");
    expect(DEMO_MAKE).toBe("Yamaha");
    expect(DEMO_MODEL).toBe("MT-07");
    expect(DEMO_REGISTRATION).toMatch(/^YA/);
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

  it("generates exactly 10 annual service entries", () => {
    const annualServices = dataset.service.filter(
      (s) => s.jobType === "basic-service" || s.jobType === "full-service"
    );
    expect(annualServices.length).toBe(10);
  });

  it("generates at least some mods", () => {
    expect(dataset.mods.length).toBeGreaterThan(0);
  });

  it("generates bills including insurance and road tax", () => {
    const billTypes = dataset.bills.map((b) => b.billType);
    expect(billTypes).toContain("insurance");
    expect(billTypes).toContain("road-tax");
  });

  // ── Determinism ─────────────────────────────────────────────────────

  it("produces the same dataset on repeated calls with the same date", () => {
    const a = generateDemoDataset(now);
    const b = generateDemoDataset(now);
    expect(a.fuel.length).toBe(b.fuel.length);
    expect(a.service.length).toBe(b.service.length);
    expect(a.finalMileage).toBe(b.finalMileage);
    expect(a.fuel[0]).toEqual(b.fuel[0]);
  });

  it("produces a different dataset when called with a different date", () => {
    const other = generateDemoDataset(new Date("2025-01-01T00:00:00.000Z"));
    // Dates shift, so at least the first fuel entry's date should differ
    expect(dataset.fuel[0].date).not.toBe(other.fuel[0].date);
  });

  // ── Date ordering ────────────────────────────────────────────────────

  it("fuel entries are sorted oldest to newest", () => {
    for (let i = 1; i < dataset.fuel.length; i++) {
      expect(dataset.fuel[i].date >= dataset.fuel[i - 1].date).toBe(true);
    }
  });

  // ── Mileage consistency ──────────────────────────────────────────────

  it("all fuel entries have positive mileage", () => {
    expect(dataset.fuel.every((f) => f.mileage > 0)).toBe(true);
  });

  it("all service entries have positive mileage", () => {
    expect(dataset.service.every((s) => s.mileage > 0)).toBe(true);
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
