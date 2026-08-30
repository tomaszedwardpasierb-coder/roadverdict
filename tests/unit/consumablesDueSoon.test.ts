import { describe, expect, it } from "vitest";
import { findConsumablesDueSoon, type ServiceHistoryPoint } from "@/lib/tracker/consumablesDueSoon";

describe("findConsumablesDueSoon", () => {
  it("only considers the most recent occurrence of each job type", () => {
    const history: ServiceHistoryPoint[] = [
      { jobType: "oil-filter", mileage: 1000, date: "2024-01-01" },
      { jobType: "oil-filter", mileage: 4900, date: "2025-01-01" }, // the real most recent one
    ];
    // oil-filter interval is 4000 miles - from the most recent point
    // (4900) at currentMileage 8800, that's 3900/4000 = 97.5%, overdue.
    // From the STALE point (1000) it would be 7800/4000 = way over 100%
    // too, so use a currentMileage that only makes sense against the
    // correct (more recent) anchor to prove which one was actually used.
    const result = findConsumablesDueSoon(history, 8800);
    expect(result.find((r) => r.jobType === "oil-filter")?.lastDoneMileage).toBe(4900);
  });

  it("excludes a job type explicitly passed in excludeJobTypes, e.g. because an active reminder already covers it", () => {
    const history: ServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 4000, date: "2025-01-01" }];
    const result = findConsumablesDueSoon(history, 7900, new Set(["oil-filter"]));
    expect(result).toEqual([]);
  });

  it("skips a job type with no known reminder default at all", () => {
    const history: ServiceHistoryPoint[] = [{ jobType: "other", mileage: 4000, date: "2025-01-01" }]; // "other" has no default - too vague to guess at, per the source's own comment
    expect(findConsumablesDueSoon(history, 20000)).toEqual([]);
  });

  it("does not surface a mileage-based item below the 85% threshold", () => {
    const history: ServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 4000, date: "2025-01-01" }]; // interval 4000
    expect(findConsumablesDueSoon(history, 7300)).toEqual([]); // 3300/4000 = 82.5%
  });

  it("surfaces a mileage-based item as due-soon at the 85% threshold", () => {
    const history: ServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 4000, date: "2025-01-01" }];
    const result = findConsumablesDueSoon(history, 7400); // 3400/4000 = 85%
    expect(result[0]).toMatchObject({ jobType: "oil-filter", intervalMiles: 4000, status: "due-soon" });
  });

  it("marks a mileage-based item overdue once the full interval has passed", () => {
    const history: ServiceHistoryPoint[] = [{ jobType: "oil-filter", mileage: 4000, date: "2025-01-01" }];
    const result = findConsumablesDueSoon(history, 8000); // 4000/4000 = 100%
    expect(result[0].status).toBe("overdue");
  });

  it("computes a months-based item using real elapsed months", () => {
    const twentyFourMonthsAgo = new Date();
    twentyFourMonthsAgo.setMonth(twentyFourMonthsAgo.getMonth() - 24);
    const history: ServiceHistoryPoint[] = [
      { jobType: "coolant-flush", mileage: 4000, date: twentyFourMonthsAgo.toISOString().slice(0, 10) },
    ];
    const result = findConsumablesDueSoon(history, 4500); // coolant-flush is months-based, 24-month interval
    expect(result[0]).toMatchObject({ jobType: "coolant-flush", intervalMonths: 24, status: "overdue" });
  });
});