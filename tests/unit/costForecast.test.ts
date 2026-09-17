// Place at: tests/unit/costForecast.test.ts
//
// Pure functions throughout, no Cosmos dependency - everything is
// already-fetched data passed straight in, same as page.tsx does at
// render time. System time is pinned so due-date-within-window
// calculations are deterministic rather than depending on when the
// test happens to run.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildServicingForecast,
  buildModsForecast,
  buildLabourForecast,
  buildBillsForecast,
  buildBikeCostForecast,
  buildBikeCostForecastAllWindows,
  pickCategoryForecast,
  FORECAST_WINDOW_MONTHS,
} from "@/lib/tracker/costForecast";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const bikeLifetime = { startingMileage: 0, currentMileage: 10000, dateAdded: "2025-01-01" };
// ~19.4 mi/day observed over the bike's whole life so far - deliberately
// a round-ish, predictable rate rather than something requiring exact
// day-boundary precision in assertions below.
const mileagePoints = [
  { date: "2025-01-01", mileage: 0 },
  { date: "2026-06-01", mileage: 10000 },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("buildModsForecast / buildLabourForecast", () => {
  it("returns an all-zero forecast with an explanatory basis when nothing's ever been logged", () => {
    const result = buildModsForecast([], "6m");
    expect(result.points).toHaveLength(FORECAST_WINDOW_MONTHS["6m"]);
    expect(result.points.every((p) => p.total === 0)).toBe(true);
    expect(result.basis).toContain("No parts & accessories spend logged yet");
  });

  it("extrapolates a flat monthly rate from the trailing average, identical across every future month", () => {
    const items = [
      { date: "2026-05-01", cost: 60 },
      { date: "2026-04-01", cost: 60 },
      { date: "2026-03-01", cost: 60 },
    ] as any; // £180 over ~3 months -> roughly £60/month
    const result = buildLabourForecast(items, "3m");
    expect(result.points).toHaveLength(3);
    const [first, ...rest] = result.points;
    expect(rest.every((p) => p.total === first.total)).toBe(true); // "very steady lines"
    expect(first.total).toBeGreaterThan(0);
    expect(result.basis).toContain("steady");
    expect(result.basis).toContain("last 3 months");
  });

  it("ignores spend outside the lookback window entirely", () => {
    const items = [{ date: "2020-01-01", cost: 5000 }] as any; // ancient, well outside any lookback
    const result = buildModsForecast(items, "3m");
    expect(result.points.every((p) => p.total === 0)).toBe(true);
  });
});

describe("buildServicingForecast", () => {
  const bikeClass = "medium" as const;

  it("shows nothing due when there are no reminders and no service history at all", () => {
    const result = buildServicingForecast({
      records: [], reminders: [], currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "6m",
    });
    expect(result.points.every((p) => p.total === 0)).toBe(true);
    expect(result.basis).toContain("Nothing due yet");
  });

  it("includes an active mileage-type reminder due within the window, costed from the owner's own average", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "reminder" as const, date: "2026-01-01", createdAt: "2026-01-01", name: "Oil change", intervalType: "mileage" as const, intervalValue: 2000, baseMileage: 10000, sourceKey: "service:oil-filter" },
    ];
    const records = [
      { id: "s1", pk: "e", type: "serviceRecord" as const, date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 45, mileage: 10000, notes: "" },
    ];
    // Due at 12,000 miles; current mileage 10,000 -> 2,000 miles needed at
    // ~19.4 mi/day is well within a 6-month window.
    const result = buildServicingForecast({ records, reminders, currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "6m" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(45); // costed from the one prior record's own cost, not a benchmark
    expect(result.basis).toContain("Oil & filter change");
  });

  it("excludes an active reminder whose due point falls outside the window", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "reminder" as const, date: "2026-01-01", createdAt: "2026-01-01", name: "Big service", intervalType: "mileage" as const, intervalValue: 50000, baseMileage: 10000, sourceKey: "service:full-service" },
    ];
    // Due at 60,000 miles - at ~19.4 mi/day that's years away, well past even a 1-year window.
    const result = buildServicingForecast({ records: [], reminders, currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "1y" });
    expect(result.points.every((p) => p.total === 0)).toBe(true);
  });

  it("falls back to the JOB_REMINDER_DEFAULTS interval for a consumable with no active reminder covering it", () => {
    const records = [
      { id: "s1", pk: "e", type: "serviceRecord" as const, date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 45, mileage: 6500, notes: "" },
    ];
    // oil-filter's own default interval is 4,000 miles -> due at 10,500,
    // just 500 miles past current mileage - reachable well inside a
    // 6-month window at this bike's observed pace, with no reminder at all.
    const result = buildServicingForecast({ records, reminders: [], currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "6m" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(45);
  });

  it("prefers an active reminder over the consumable fallback for the same job type", () => {
    const records = [
      { id: "s1", pk: "e", type: "serviceRecord" as const, date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 45, mileage: 6500, notes: "" },
    ];
    const reminders = [
      // A custom, much longer interval than the 4,000-mile default -
      // if the fallback fired too it would double-count this job.
      { id: "r1", pk: "e", type: "reminder" as const, date: "2026-01-01", createdAt: "2026-01-01", name: "Oil change", intervalType: "mileage" as const, intervalValue: 20000, baseMileage: 6500, sourceKey: "service:oil-filter" },
    ];
    const result = buildServicingForecast({ records, reminders, currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "1y" });
    // Due at 26,500 miles - out of range even at a year, and the
    // consumable fallback must NOT have separately fired for the same job.
    expect(result.points.every((p) => p.total === 0)).toBe(true);
  });

  it("costs a due item from the sourced benchmark when there's no owner history for that job type", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "reminder" as const, date: "2026-01-01", createdAt: "2026-01-01", name: "Full service", intervalType: "mileage" as const, intervalValue: 2000, baseMileage: 10000, sourceKey: "service:full-service" },
    ];
    // No prior "full-service" record at all - full-service is a
    // benchmarked job type, so the sourced UK range should be used
    // instead of being silently excluded.
    const result = buildServicingForecast({ records: [], reminders, currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "6m" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBeGreaterThan(0);
    expect(result.basis).toContain("sourced UK estimate");
  });

  it("excludes an unpriced due item from the total, but says so in the basis text rather than pretending nothing's due", () => {
    const reminders = [
      // A job type that's neither in the owner's own history nor benchmarked.
      { id: "r1", pk: "e", type: "reminder" as const, date: "2026-01-01", createdAt: "2026-01-01", name: "Custom job", intervalType: "mileage" as const, intervalValue: 2000, baseMileage: 10000, sourceKey: "service:some-unbenchmarked-job" },
    ];
    const result = buildServicingForecast({ records: [], reminders, currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass, window: "6m" });
    expect(result.points.every((p) => p.total === 0)).toBe(true);
    expect(result.basis).toContain("no cost history or estimate available yet");
  });
});

describe("buildBillsForecast", () => {
  it("reconstructs a road tax renewal from the latest logged bill, with no reminder needed", () => {
    const bills = [
      { id: "b1", pk: "e", type: "bill" as const, date: "2026-01-01", createdAt: "2026-01-01", billType: "road-tax", cost: 180, notes: "" },
    ];
    // Due 12 months after 2026-01-01 = 2027-01-01, within a 1-year window from 2026-06-01.
    const result = buildBillsForecast({ bills, reminders: [], window: "1y" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBeGreaterThanOrEqual(180);
    expect(result.basis).toContain("road-tax");
  });

  it("only shows an insurance renewal when an active reminder actually exists for it", () => {
    const bills = [
      { id: "b1", pk: "e", type: "bill" as const, date: "2026-01-01", createdAt: "2026-01-01", billType: "insurance", cost: 320, notes: "" },
    ];
    const withoutReminder = buildBillsForecast({ bills, reminders: [], window: "1y" });
    expect(withoutReminder.basis).not.toContain("insurance");

    const withReminder = buildBillsForecast({
      bills,
      reminders: [{ id: "r1", pk: "e", type: "reminder" as const, date: "2026-01-01", createdAt: "2026-01-01", name: "Insurance", intervalType: "months" as const, intervalValue: 12, sourceKey: "bill:insurance" }],
      window: "1y",
    });
    expect(withReminder.basis).toContain("insurance");
  });

  it("falls back to a flat average baseline for a bill type with no known due point (e.g. finance)", () => {
    const bills = [
      { id: "b1", pk: "e", type: "bill" as const, date: "2026-05-01", createdAt: "2026-05-01", billType: "finance", cost: 200, notes: "" },
      { id: "b2", pk: "e", type: "bill" as const, date: "2026-04-01", createdAt: "2026-04-01", billType: "finance", cost: 200, notes: "" },
    ];
    const result = buildBillsForecast({ bills, reminders: [], window: "3m" });
    expect(result.points.every((p) => p.total > 0)).toBe(true);
    expect(result.basis).toContain("steady average for everything else");
  });

  it("reports no basis at all when nothing's logged", () => {
    const result = buildBillsForecast({ bills: [], reminders: [], window: "6m" });
    expect(result.basis).toContain("No bills logged yet");
  });
});

describe("buildBikeCostForecast / buildBikeCostForecastAllWindows / pickCategoryForecast", () => {
  const baseInput = {
    records: [], mods: [], bills: [], labour: [], reminders: [],
    currentMileage: 10000, mileagePoints, bikeLifetime, bikeClass: "medium" as const,
  };

  it("returns one forecast per category", () => {
    const result = buildBikeCostForecast({ ...baseInput, window: "6m" });
    expect(result).toHaveProperty("servicing");
    expect(result).toHaveProperty("mods");
    expect(result).toHaveProperty("bills");
    expect(result).toHaveProperty("labour");
  });

  it("computes all three windows, each with the right number of future months", () => {
    const result = buildBikeCostForecastAllWindows(baseInput);
    expect(result["3m"].mods.points).toHaveLength(3);
    expect(result["6m"].mods.points).toHaveLength(6);
    expect(result["1y"].mods.points).toHaveLength(12);
  });

  it("pickCategoryForecast transposes a by-window bundle into a by-window bundle of just one category", () => {
    const byWindow = buildBikeCostForecastAllWindows(baseInput);
    const servicing = pickCategoryForecast(byWindow, "servicing");
    expect(Object.keys(servicing).sort()).toEqual(["1y", "3m", "6m"]);
    expect(servicing["3m"]).toBe(byWindow["3m"].servicing);
    expect(servicing["1y"]).toBe(byWindow["1y"].servicing);
  });
});
