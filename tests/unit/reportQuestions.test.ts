import { describe, expect, it } from "vitest";
import { generateBuyerQuestions } from "@/lib/tracker/reportQuestions";
import {
  RECEIPT_COVERAGE_POOR,
  LARGE_CLUSTER_SPAN_DAYS,
  RECENT_REGISTRATION_CHANGE_DAYS,
  type SellerVerdictMetrics,
} from "@/lib/tracker/sellerReportVerdict";

const cleanMetrics: SellerVerdictMetrics = {
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

describe("generateBuyerQuestions", () => {
  it("always includes the independent DVSA cross-check question, even for a genuinely clean bike", () => {
    const questions = generateBuyerQuestions(cleanMetrics);
    expect(questions.some((q) => q.includes("Cross-check the claimed mileage against the DVSA"))).toBe(true);
  });

  it("asks about a large bulk-logging session at the real threshold, with month rounding", () => {
    const metrics = { ...cleanMetrics, entriesInBulkClusters: 8, largestClusterSpanDays: LARGE_CLUSTER_SPAN_DAYS };
    const questions = generateBuyerQuestions(metrics);
    expect(questions.some((q) => q.includes("6 months of history was logged in one sitting"))).toBe(true);
  });

  // Two different bulk-logging questions exist depending on severity -
  // a smaller cluster below the large-span threshold gets the softer
  // question, not the "months in one sitting" one.
  it("asks the softer batch-logging question for a small cluster below the large-span threshold", () => {
    const metrics = { ...cleanMetrics, entriesInBulkClusters: 4, largestClusterSpanDays: 10 }; // 4/10 clustered -> progressiveLogging 0.6, below the 0.7 threshold
    const questions = generateBuyerQuestions(metrics);
    expect(questions.some((q) => q === "Ask why some of the history was logged in batches rather than as things happened.")).toBe(true);
    expect(questions.some((q) => q.includes("logged in one sitting"))).toBe(false);
  });

  it("asks neither bulk-logging question for a bike with no bulk-clustered entries at all", () => {
    const questions = generateBuyerQuestions(cleanMetrics);
    expect(questions.some((q) => q.includes("logged in one sitting") || q.includes("logged in batches"))).toBe(false);
  });

  it("asks about mileage discrepancies, correctly pluralised", () => {
    const one = generateBuyerQuestions({ ...cleanMetrics, mileageViolationCount: 1 });
    expect(one.some((q) => q.includes("mileage discrepancy in the logged history"))).toBe(true);

    const many = generateBuyerQuestions({ ...cleanMetrics, mileageViolationCount: 3 });
    expect(many.some((q) => q.includes("mileage discrepancies in the logged history"))).toBe(true);
  });

  it("asks about receipts below the real poor-coverage threshold", () => {
    const metrics = { ...cleanMetrics, totalEntries: 10, receiptCount: 2 }; // 20%, below 0.3
    expect(generateBuyerQuestions(metrics).some((q) => q.includes("physical receipts or invoices"))).toBe(true);
  });

  it("does not ask about receipts at or above the poor-coverage threshold", () => {
    const metrics = { ...cleanMetrics, totalEntries: 10, receiptCount: Math.round(10 * RECEIPT_COVERAGE_POOR) };
    expect(generateBuyerQuestions(metrics).some((q) => q.includes("physical receipts or invoices"))).toBe(false);
  });

  it("asks about overdue items, correctly using singular wording for exactly one", () => {
    const questions = generateBuyerQuestions({ ...cleanMetrics, overdueReminderCount: 1 });
    expect(questions.some((q) => q.includes("the overdue item shown below was last actually checked"))).toBe(true);
  });

  it("asks about overdue items, correctly using plural wording for more than one", () => {
    const questions = generateBuyerQuestions({ ...cleanMetrics, overdueReminderCount: 3 });
    expect(questions.some((q) => q.includes("the 3 overdue items shown below were last actually checked"))).toBe(true);
  });

  it("asks about a recent registration change within the real threshold", () => {
    const metrics = { ...cleanMetrics, recentRegistrationChangeDays: RECENT_REGISTRATION_CHANGE_DAYS };
    expect(generateBuyerQuestions(metrics).some((q) => q.includes(`changed ${RECENT_REGISTRATION_CHANGE_DAYS} days before`))).toBe(true);
  });

  it("does not ask about registration change when there was none, or it was outside the threshold", () => {
    expect(generateBuyerQuestions(cleanMetrics).some((q) => q.includes("registration changed"))).toBe(false);
    const outside = { ...cleanMetrics, recentRegistrationChangeDays: RECENT_REGISTRATION_CHANGE_DAYS + 1 };
    expect(generateBuyerQuestions(outside).some((q) => q.includes("registration changed"))).toBe(false);
  });
});