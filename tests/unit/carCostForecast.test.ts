// Place at: tests/unit/carCostForecast.test.ts
//
// Car equivalent of costForecast.test.ts - mirrors that file's coverage
// but isn't a byte-for-byte duplicate, since carCostForecast.ts is a
// genuinely separate implementation (not a thin wrapper), and the two
// files use different benchmarked/default job-type catalogs (e.g.
// "oil-filter" IS benchmarked for cars, unlike bikes - see
// CAR_BENCHMARKED_JOB_TYPES in carJobTypes.ts). System time is pinned
// the same way, for the same reason.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCarServicingForecast,
  buildCarModsForecast,
  buildCarLabourForecast,
  buildCarBillsForecast,
  buildCarCostForecast,
  buildCarCostForecastAllWindows,
} from "@/lib/tracker/carCostForecast";
import { FORECAST_WINDOW_MONTHS } from "@/lib/tracker/costForecast";

const NOW = new Date("2026-06-01T00:00:00.000Z");
const carLifetime = { startingMileage: 0, currentMileage: 10000, dateAdded: "2025-01-01" };
// ~19.4 mi/day observed over the car's whole life so far - same round
// rate costForecast.test.ts uses, for the same predictability reason.
const mileagePoints = [
  { date: "2025-01-01", mileage: 0 },
  { date: "2026-06-01", mileage: 10000 },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("buildCarModsForecast / buildCarLabourForecast", () => {
  it("returns an all-zero forecast with an explanatory basis when nothing's ever been logged", () => {
    const result = buildCarModsForecast([], "6m");
    expect(result.points).toHaveLength(FORECAST_WINDOW_MONTHS["6m"]);
    expect(result.points.every((p) => p.total === 0)).toBe(true);
    expect(result.basis).toContain("No parts & accessories spend logged yet");
  });

  it("extrapolates a flat monthly rate from the trailing average", () => {
    const items = [
      { date: "2026-05-01", cost: 60 },
      { date: "2026-04-01", cost: 60 },
      { date: "2026-03-01", cost: 60 },
    ];
    const result = buildCarLabourForecast(items as any, "6m");
    expect(result.points).toHaveLength(6);
    const [first, ...rest] = result.points;
    expect(rest.every((p) => p.total === first.total)).toBe(true);
    expect(first.total).toBeGreaterThan(0);
  });

  // "1w"/"1m" collapse to a single flat bucket instead of a monthly
  // line - see costForecast.test.ts's own fuller coverage of this; only
  // the car-specific delta (that this collapsing logic is imported and
  // genuinely shared, not re-implemented here) is worth checking again.
  it("collapses to a single point for a sub-month window", () => {
    const items = [{ date: "2026-05-01", cost: 60 }] as any;
    const result = buildCarLabourForecast(items, "1w");
    expect(result.points).toHaveLength(1);
    expect(result.points[0].month).toBe("Next week");
  });
});

describe("buildCarServicingForecast", () => {
  const carClass = "medium" as const;

  it("shows nothing due when there are no reminders and no service history at all", () => {
    const result = buildCarServicingForecast({
      records: [], reminders: [], currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "6m",
    });
    expect(result.points.every((p) => p.total === 0)).toBe(true);
    expect(result.basis).toContain("Nothing due yet");
  });

  it("includes an active mileage-type reminder due within the window, costed from the owner's own average", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "carReminder" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", name: "Oil change", intervalType: "mileage" as const, intervalValue: 2000, baseMileage: 10000, sourceKey: "service:oil-filter" },
    ];
    const records = [
      { id: "s1", pk: "e", type: "carServiceRecord" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 65, mileage: 10000, notes: "" },
    ];
    // Due at 12,000 miles - 2,000 miles needed at ~19.4 mi/day is well
    // within a 6-month window.
    const result = buildCarServicingForecast({ records, reminders, currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "6m" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(65);
    expect(result.basis).toContain("Oil & filter change");
  });

  // Regression coverage for the current-month bucketing bug fixed
  // alongside this test: futureMonthKeys only enumerates months strictly
  // after "now", so a due date landing later THIS month must still be
  // folded into the nearest future bucket rather than silently dropped.
  it("still counts a due item whose date falls later in the current calendar month", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "carReminder" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", name: "Oil change", intervalType: "mileage" as const, intervalValue: 500, baseMileage: 10000, sourceKey: "service:oil-filter" },
    ];
    const records = [
      { id: "s1", pk: "e", type: "carServiceRecord" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 65, mileage: 10000, notes: "" },
    ];
    // Due at 10,500 miles - 500 miles at ~19.4 mi/day is about 26 days
    // away, landing well inside June (the current month), not July.
    const result = buildCarServicingForecast({ records, reminders, currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "6m" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(65);
  });

  it("falls back to CAR_JOB_REMINDER_DEFAULTS for a consumable with no active reminder covering it", () => {
    const records = [
      // oil-filter's car default interval is 10,000 miles -> due at
      // 16,500, comfortably inside a 1-year window at this pace.
      { id: "s1", pk: "e", type: "carServiceRecord" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 65, mileage: 6500, notes: "" },
    ];
    const result = buildCarServicingForecast({ records, reminders: [], currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "1y" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(65);
  });

  it("costs a due item from the sourced benchmark when there's no owner history for that job type", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "carReminder" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", name: "Full service", intervalType: "mileage" as const, intervalValue: 2000, baseMileage: 10000, sourceKey: "service:full-service" },
    ];
    const result = buildCarServicingForecast({ records: [], reminders, currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "6m" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBeGreaterThan(0);
    expect(result.basis).toContain("sourced UK estimate");
  });

  it("excludes an unpriced due item from the total, but says so in the basis text rather than pretending nothing's due", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "carReminder" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", name: "Custom job", intervalType: "mileage" as const, intervalValue: 2000, baseMileage: 10000, sourceKey: "service:some-unbenchmarked-job" },
    ];
    const result = buildCarServicingForecast({ records: [], reminders, currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "6m" });
    expect(result.points.every((p) => p.total === 0)).toBe(true);
    expect(result.basis).toContain("no cost history or estimate available yet");
  });

  it("counts a due item within a sub-month '1 week' window, in its single collapsed bucket", () => {
    const reminders = [
      { id: "r1", pk: "e", type: "carReminder" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", name: "Oil change", intervalType: "mileage" as const, intervalValue: 100, baseMileage: 10000, sourceKey: "service:oil-filter" },
    ];
    const records = [
      { id: "s1", pk: "e", type: "carServiceRecord" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", jobType: "oil-filter", cost: 65, mileage: 10000, notes: "" },
    ];
    // Due at 10,100 miles - 100 miles at ~19.4 mi/day is about 5 days away.
    const result = buildCarServicingForecast({ records, reminders, currentMileage: 10000, mileagePoints, carLifetime, carClass, window: "1w" });
    expect(result.points).toHaveLength(1);
    expect(result.points[0].total).toBe(65);
  });
});

describe("buildCarBillsForecast", () => {
  it("reconstructs a road tax renewal from the latest logged bill, with no reminder needed", () => {
    const bills = [
      { id: "b1", pk: "e", type: "carBill" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", billType: "road-tax", cost: 190, notes: "" },
    ];
    const result = buildCarBillsForecast({ bills, reminders: [], window: "1y" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBeGreaterThanOrEqual(190);
    expect(result.basis).toContain("road-tax");
  });

  // Regression coverage for the same overdue-renewal bug fixed alongside
  // this test in costForecast.ts's own fuller version - see that file's
  // own comment for the full reasoning.
  it("rolls an overdue-relative-to-now renewal forward to its next real occurrence, rather than silently dropping it", () => {
    const bills = [
      { id: "b1", pk: "e", type: "carBill" as const, carId: "c1", date: "2025-01-01", createdAt: "2025-01-01", billType: "road-tax", cost: 190, notes: "" },
    ];
    // Naively due 2026-01-01, already before "now" (2026-06-01) - the
    // next real occurrence is 2027-01-01.
    const result = buildCarBillsForecast({ bills, reminders: [], window: "1y" });
    const total = result.points.reduce((sum, p) => sum + p.total, 0);
    expect(total).toBe(190);
  });

  it("only shows an insurance renewal when an active reminder actually exists for it", () => {
    const bills = [
      { id: "b1", pk: "e", type: "carBill" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", billType: "insurance", cost: 400, notes: "" },
    ];
    const withoutReminder = buildCarBillsForecast({ bills, reminders: [], window: "1y" });
    expect(withoutReminder.basis).not.toContain("insurance");

    const withReminder = buildCarBillsForecast({
      bills,
      reminders: [{ id: "r1", pk: "e", type: "carReminder" as const, carId: "c1", date: "2026-01-01", createdAt: "2026-01-01", name: "Insurance", intervalType: "months" as const, intervalValue: 12, sourceKey: "bill:insurance" }],
      window: "1y",
    });
    expect(withReminder.basis).toContain("insurance");
  });

  it("reports no basis at all when nothing's logged", () => {
    const result = buildCarBillsForecast({ bills: [], reminders: [], window: "6m" });
    expect(result.basis).toContain("No bills logged yet");
  });
});

describe("buildCarCostForecast / buildCarCostForecastAllWindows", () => {
  const baseInput = {
    records: [], mods: [], bills: [], labour: [], reminders: [],
    currentMileage: 10000, mileagePoints, carLifetime, carClass: "medium" as const,
  };

  it("returns one forecast per category", () => {
    const result = buildCarCostForecast({ ...baseInput, window: "6m" });
    expect(result).toHaveProperty("servicing");
    expect(result).toHaveProperty("mods");
    expect(result).toHaveProperty("bills");
    expect(result).toHaveProperty("labour");
  });

  it("computes every window, each with the right number of points", () => {
    const result = buildCarCostForecastAllWindows(baseInput);
    expect(result["1w"].mods.points).toHaveLength(1);
    expect(result["1m"].mods.points).toHaveLength(1);
    expect(result["6m"].mods.points).toHaveLength(6);
    expect(result["1y"].mods.points).toHaveLength(12);
  });
});
