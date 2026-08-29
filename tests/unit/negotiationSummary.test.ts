import { describe, expect, it } from "vitest";
import { buildNegotiationSummary } from "@/lib/tracker/negotiationSummary";
import { buildEvidenceQuality } from "@/lib/tracker/evidenceQuality";
import type { UpcomingCostItem } from "@/lib/tracker/upcomingCosts";
import type { WalkAwayIssue } from "@/lib/tracker/walkAwayRisks";

const priced = (low: number, high: number): UpcomingCostItem => ({
  jobType: "full-service",
  label: "Full service",
  timing: "due-soon",
  timingDetail: "due soon",
  pricing: { status: "priced", low, high, confidence: "higher", sourceName: "x", lastReviewed: "2025" },
});
const notPriced: UpcomingCostItem = {
  jobType: "custom-job",
  label: "Custom job",
  timing: "overdue",
  timingDetail: "overdue",
  pricing: { status: "not-priced" },
};
const goodEvidence = buildEvidenceQuality(10, 8, 8, 30, 0); // 80% receipt coverage

describe("buildNegotiationSummary", () => {
  it("passes the asking price straight through", () => {
    expect(buildNegotiationSummary(4500, [], [], [], goodEvidence).askingPrice).toBe(4500);
  });

  it("returns no upcoming-costs total when nothing could be priced", () => {
    const result = buildNegotiationSummary(4500, [notPriced], [], [], goodEvidence);
    expect(result.upcomingCostsTotal).toBeNull();
  });

  it("sums only the priced items into the upcoming-costs total, ignoring unpriced ones", () => {
    const result = buildNegotiationSummary(4500, [priced(100, 200), priced(50, 80), notPriced], [], [], goodEvidence);
    expect(result.upcomingCostsTotal).toEqual({ low: 150, high: 280 });
    expect(result.discussionPoints.some((p) => p.includes("£150-£280"))).toBe(true);
  });

  it("counts and reports unpriced items, correctly pluralised", () => {
    const one = buildNegotiationSummary(4500, [notPriced], [], [], goodEvidence);
    expect(one.uncostedUpcomingCount).toBe(1);
    expect(one.discussionPoints.some((p) => p.includes("1 upcoming item couldn't be priced"))).toBe(true);

    const two = buildNegotiationSummary(4500, [notPriced, notPriced], [], [], goodEvidence);
    expect(two.discussionPoints.some((p) => p.includes("2 upcoming items couldn't be priced"))).toBe(true);
  });

  it("raises walk-away issues as a discussion point, correctly pluralised", () => {
    const issues: WalkAwayIssue[] = [{ label: "Mileage", detail: "x" }];
    const result = buildNegotiationSummary(4500, [], issues, [], goodEvidence);
    expect(result.discussionPoints.some((p) => p.includes("1 potential walk-away issue flagged"))).toBe(true);
  });

  it("raises unconfirmed findings as a discussion point, correctly pluralised", () => {
    const result = buildNegotiationSummary(4500, [], [], ["Service history before 2020", "Original owner"], goodEvidence);
    expect(result.discussionPoints.some((p) => p.includes("2 areas of this bike's history aren't confirmed"))).toBe(true);
  });

  it("raises low receipt coverage as a discussion point below the 50% threshold", () => {
    const poorEvidence = buildEvidenceQuality(10, 3, 3, 30, 0); // 30% coverage
    const result = buildNegotiationSummary(4500, [], [], [], poorEvidence);
    expect(result.discussionPoints.some((p) => p.includes("Only 30% of logged entries"))).toBe(true);
  });

  it("does not raise receipt coverage when it's at or above the 50% threshold", () => {
    const result = buildNegotiationSummary(4500, [], [], [], goodEvidence); // 80%
    expect(result.discussionPoints.some((p) => p.includes("logged entries have a receipt"))).toBe(false);
  });

  // Guards the pct() default (1, i.e. 100%) that a zero-total-records
  // evidenceQuality would otherwise produce - without this check, a
  // bike with nothing logged at all could wrongly surface a "low
  // receipt coverage" point despite having no receipts to even judge.
  it("does not raise receipt coverage when there are no logged records at all", () => {
    const emptyEvidence = buildEvidenceQuality(0, 0, 0, 0, 0);
    const result = buildNegotiationSummary(4500, [], [], [], emptyEvidence);
    expect(result.discussionPoints.some((p) => p.includes("logged entries have a receipt"))).toBe(false);
  });

  it("returns no discussion points at all for a genuinely clean, well-documented bike", () => {
    const result = buildNegotiationSummary(4500, [], [], [], goodEvidence);
    expect(result.discussionPoints).toEqual([]);
  });
});