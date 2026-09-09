import { describe, expect, it } from "vitest";
import { findCarConsumablesDueSoon, type CarServiceHistoryPoint } from "@/lib/tracker/carConsumablesDueSoon";

// CAR_JOB_REMINDER_DEFAULTS: oil-filter is mileage-based, 10000mi;
// coolant-flush is months-based, 24 months.
describe("findCarConsumablesDueSoon", () => {
  it("only considers the most recent occurrence of each job type", () => {
    const history: CarServiceHistoryPoint[] = [
      { jobType: "oil-filter", mileage: 1000, date: "2024-01-01" },
      { jobType: "oil-filter", mileage: 15000, date: "2025-01-01" }, // the real most recent one
    ];
    // From the real anchor (15000) at currentMileage 24500, that's
    // 9500/10000 = 95%, overdue - proving the correct anchor was used.
    const result = findCarConsumablesDueSoon(history, 24500);
    expect(result.find((r) => r.jobType === "oil-filter")?.lastDoneMileage).toBe(15000);
  });

  it("excludes a job type explicitly passed in excludeJobTypes, e.g. because an active reminder already covers it", () => {
    const history: CarServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 10000, date: "2025-01-01" }];
    const result = findCarConsumablesDueSoon(history, 19900, new Set(["oil-filter"]));
    expect(result).toEqual([]);
  });

  it("skips a job type with no known reminder default at all", () => {
    const history: CarServiceHistoryPoint[] = [{ jobType: "other", mileage: 4000, date: "2025-01-01" }];
    expect(findCarConsumablesDueSoon(history, 40000)).toEqual([]);
  });

  it("does not surface a mileage-based item below the 85% threshold", () => {
    const history: CarServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 10000, date: "2025-01-01" }]; // interval 10000
    expect(findCarConsumablesDueSoon(history, 18400)).toEqual([]); // 8400/10000 = 84%
  });

  it("surfaces a mileage-based item as due-soon at the 85% threshold", () => {
    const history: CarServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 10000, date: "2025-01-01" }];
    const result = findCarConsumablesDueSoon(history, 18500); // 8500/10000 = 85%
    expect(result[0]).toMatchObject({ jobType: "oil-filter", intervalMiles: 10000, status: "due-soon" });
  });

  it("marks a mileage-based item overdue once the full interval has passed", () => {
    const history: CarServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 10000, date: "2025-01-01" }];
    const result = findCarConsumablesDueSoon(history, 20000); // 10000/10000 = 100%
    expect(result[0].status).toBe("overdue");
  });

  it("computes a months-based item using real elapsed months", () => {
    const twentyFourMonthsAgo = new Date();
    twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
    const history: CarServiceHistoryPoint[] = [
      { jobType: "coolant-flush", mileage: 4000, date: twentyFourMonthsAgo.toISOString().slice(0, 10) },
    ];
    const result = findCarConsumablesDueSoon(history, 4500); // coolant-flush is months-based, 24-month interval
    expect(result[0]).toMatchObject({ jobType: "coolant-flush", intervalMonths: 24, status: "overdue" });
  });
});
