import { describe, expect, it } from "vitest";
import { computeSellerVerdict } from "@/lib/tracker/sellerReportVerdict";

const baseMetrics = {
  totalEntries: 10,
  receiptCount: 8,
  entriesInBulkClusters: 0,
  largestClusterSpanDays: 0,
  mileageViolationCount: 0,
  longestGapDays: 30,
  spanYears: 2,
  overdueReminderCount: 0,
  totalReminderCount: 3,
  recentRegistrationChangeDays: null,
};

describe("computeSellerVerdict", () => {
  it("returns well documented for complete, consistent history", () => {
    expect(computeSellerVerdict(baseMetrics).tier).toBe("well-documented");
  });

  it("returns limited documentation for mileage violations", () => {
    expect(computeSellerVerdict({ ...baseMetrics, mileageViolationCount: 1 }).tier).toBe("limited-documentation");
  });

  it("returns limited documentation for an empty history", () => {
    expect(computeSellerVerdict({ ...baseMetrics, totalEntries: 0, receiptCount: 0 }).tier).toBe("limited-documentation");
  });

  it("returns partial documentation for overdue reminders", () => {
    expect(computeSellerVerdict({ ...baseMetrics, overdueReminderCount: 1 }).tier).toBe("partially-documented");
  });

  // The two most product-specific signals in this whole function - the
  // ones actually called out by name in real generated reports - had no
  // coverage at all before this. Both are worth locking in explicitly
  // rather than trusting the four cases above to exercise them by luck.

  it("returns limited documentation when a single logging session covers a large span of claimed history", () => {
    const result = computeSellerVerdict({ ...baseMetrics, entriesInBulkClusters: 8, largestClusterSpanDays: 200 });
    expect(result.tier).toBe("limited-documentation");
  });

  it("returns partial documentation for even a small bulk-logged cluster, below the large-span threshold", () => {
    const result = computeSellerVerdict({ ...baseMetrics, entriesInBulkClusters: 2, largestClusterSpanDays: 10 });
    expect(result.tier).toBe("partially-documented");
  });

  it("returns partial documentation when the registration changed shortly before the report was generated", () => {
    const result = computeSellerVerdict({ ...baseMetrics, recentRegistrationChangeDays: 5 });
    expect(result.tier).toBe("partially-documented");
  });

  it("does not penalise a registration change that happened well before the report", () => {
    const result = computeSellerVerdict({ ...baseMetrics, recentRegistrationChangeDays: 45 });
    expect(result.tier).toBe("well-documented");
  });

  // Both threshold constants use strict "<" in the real function, so the
  // exact boundary value itself should NOT trigger the poorer tier - an
  // easy off-by-one to introduce by "fixing" one of these to "<=" later
  // without noticing it changes behaviour right at the threshold.
  it("treats receipt coverage exactly at the poor threshold as partial, not limited", () => {
    const result = computeSellerVerdict({ ...baseMetrics, totalEntries: 10, receiptCount: 3 }); // exactly 0.3
    expect(result.tier).toBe("partially-documented");
  });

  it("treats receipt coverage just below the poor threshold as limited", () => {
    const result = computeSellerVerdict({ ...baseMetrics, totalEntries: 10, receiptCount: 2 }); // 0.2, below 0.3
    expect(result.tier).toBe("limited-documentation");
  });
});