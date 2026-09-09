import { describe, expect, it } from "vitest";
import { generateCarBuyerQuestions } from "@/lib/tracker/carReportQuestions";
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

describe("generateCarBuyerQuestions", () => {
  it("always includes the independent DVSA cross-check question, even for a genuinely clean car", () => {
    const questions = generateCarBuyerQuestions(cleanMetrics);
    expect(questions.some((q) => q.includes("Cross-check the claimed mileage against the DVSA"))).toBe(true);
  });

  it("asks about a large bulk-logging session at the real threshold, with month rounding", () => {
    const metrics = { ...cleanMetrics, entriesInBulkClusters: 8, largestClusterSpanDays: LARGE_CLUSTER_SPAN_DAYS };
    const questions = generateCarBuyerQuestions(metrics);
    expect(questions.some((q) => q.includes("6 months of history was logged in one sitting"))).toBe(true);
  });

  it("asks the softer batch-logging question for a small cluster below the large-span threshold", () => {
    const metrics = { ...cleanMetrics, entriesInBulkClusters: 4, largestClusterSpanDays: 10 };
    const questions = generateCarBuyerQuestions(metrics);
    expect(questions.some((q) => q === "Ask why some of the history was logged in batches rather than as things happened.")).toBe(true);
    expect(questions.some((q) => q.includes("logged in one sitting"))).toBe(false);
  });

  it("asks about mileage discrepancies, correctly pluralised", () => {
    const one = generateCarBuyerQuestions({ ...cleanMetrics, mileageViolationCount: 1 });
    expect(one.some((q) => q.includes("mileage discrepancy in the logged history"))).toBe(true);

    const many = generateCarBuyerQuestions({ ...cleanMetrics, mileageViolationCount: 3 });
    expect(many.some((q) => q.includes("mileage discrepancies in the logged history"))).toBe(true);
  });

  it("asks about receipts below the real poor-coverage threshold", () => {
    const metrics = { ...cleanMetrics, totalEntries: 10, receiptCount: 2 };
    expect(generateCarBuyerQuestions(metrics).some((q) => q.includes("physical receipts or invoices"))).toBe(true);
  });

  it("does not ask about receipts at or above the poor-coverage threshold", () => {
    const metrics = { ...cleanMetrics, totalEntries: 10, receiptCount: Math.round(10 * RECEIPT_COVERAGE_POOR) };
    expect(generateCarBuyerQuestions(metrics).some((q) => q.includes("physical receipts or invoices"))).toBe(false);
  });

  it("asks about overdue items, correctly using singular wording for exactly one", () => {
    const questions = generateCarBuyerQuestions({ ...cleanMetrics, overdueReminderCount: 1 });
    expect(questions.some((q) => q.includes("the overdue item shown below was last actually checked"))).toBe(true);
  });

  it("asks about overdue items, correctly using plural wording for more than one", () => {
    const questions = generateCarBuyerQuestions({ ...cleanMetrics, overdueReminderCount: 3 });
    expect(questions.some((q) => q.includes("the 3 overdue items shown below were last actually checked"))).toBe(true);
  });

  // The one line that genuinely differs from the bike version - "car"
  // instead of "bike".
  it("asks about a recent registration change, referring to the car (not the bike) being listed", () => {
    const metrics = { ...cleanMetrics, recentRegistrationChangeDays: RECENT_REGISTRATION_CHANGE_DAYS };
    const questions = generateCarBuyerQuestions(metrics);
    expect(questions.some((q) => q.includes(`changed ${RECENT_REGISTRATION_CHANGE_DAYS} days before this car was listed`))).toBe(true);
  });

  it("does not ask about registration change when there was none, or it was outside the threshold", () => {
    expect(generateCarBuyerQuestions(cleanMetrics).some((q) => q.includes("registration changed"))).toBe(false);
    const outside = { ...cleanMetrics, recentRegistrationChangeDays: RECENT_REGISTRATION_CHANGE_DAYS + 1 };
    expect(generateCarBuyerQuestions(outside).some((q) => q.includes("registration changed"))).toBe(false);
  });
});
