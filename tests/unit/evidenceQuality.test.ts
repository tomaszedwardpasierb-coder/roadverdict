import { describe, expect, it } from "vitest";
import { buildEvidenceQuality } from "@/lib/tracker/evidenceQuality";

describe("buildEvidenceQuality", () => {
  it("computes receipt and real-time percentages with rounding", () => {
    const result = buildEvidenceQuality(3, 1, 2, 30, 0);
    expect(result.receiptCoveragePct).toBe(33); // 1/3 rounds to 33
    expect(result.realTimePct).toBe(67); // 2/3 rounds to 67
  });

  it("defaults both percentages to 0 for zero total records, rather than dividing by zero", () => {
    const result = buildEvidenceQuality(0, 0, 0, 0, 0);
    expect(result.receiptCoveragePct).toBe(0);
    expect(result.realTimePct).toBe(0);
  });

  it("is internally consistent only when there are zero mileage violations", () => {
    expect(buildEvidenceQuality(10, 5, 5, 10, 0).mileageInternallyConsistent).toBe(true);
    expect(buildEvidenceQuality(10, 5, 5, 10, 1).mileageInternallyConsistent).toBe(false);
  });

  it("passes totalRecords, receiptCount, realTimeCount, and longestGapDays straight through", () => {
    const result = buildEvidenceQuality(12, 4, 6, 45, 0);
    expect(result.totalRecords).toBe(12);
    expect(result.receiptCount).toBe(4);
    expect(result.realTimeCount).toBe(6);
    expect(result.longestGapDays).toBe(45);
  });
});