// Place at: src/lib/tracker/negotiationSummary.ts
//
// Every field here is either the seller's own entered price, a sum of
// numbers already benchmarked elsewhere (see upcomingCosts.ts), or a
// count of gaps already computed elsewhere (walkAwayRisks.ts,
// reportNarrative.ts, evidenceQuality.ts) - nothing here is generated
// or estimated fresh. Deliberately never computes or suggests a
// counter-offer price - only factual points a buyer could raise, which
// is what stays defensible without reliable market data behind it.
import type { UpcomingCostItem } from "./upcomingCosts";
import type { WalkAwayIssue } from "./walkAwayRisks";
import type { EvidenceQuality } from "./evidenceQuality";

// Below this, receipt coverage is a real gap worth raising, not just
// normal, incomplete record-keeping. Named and tunable, not a number
// chosen once and buried inline.
const LOW_RECEIPT_COVERAGE_THRESHOLD = 50;

export interface NegotiationSummary {
  askingPrice: number;
  upcomingCostsTotal: { low: number; high: number } | null;
  uncostedUpcomingCount: number;
  discussionPoints: string[];
}

export function buildNegotiationSummary(
  askingPrice: number,
  upcomingCostItems: UpcomingCostItem[],
  walkAwayIssues: WalkAwayIssue[],
  unconfirmedFindings: string[],
  evidenceQuality: EvidenceQuality
): NegotiationSummary {
  let pricedCount = 0;
  let low = 0;
  let high = 0;
  for (const item of upcomingCostItems) {
    if (item.pricing.status === "priced") {
      pricedCount++;
      low += item.pricing.low;
      high += item.pricing.high;
    }
  }
  const uncostedUpcomingCount = upcomingCostItems.length - pricedCount;
  const upcomingCostsTotal = pricedCount > 0 ? { low, high } : null;

  const discussionPoints: string[] = [];

  if (upcomingCostsTotal) {
    discussionPoints.push(
      `This bike has an estimated £${upcomingCostsTotal.low.toLocaleString()}-£${upcomingCostsTotal.high.toLocaleString()} of upcoming maintenance costs (see "What's coming up" above) - worth raising before agreeing a price.`
    );
  }
  if (uncostedUpcomingCount > 0) {
    discussionPoints.push(
      `${uncostedUpcomingCount} upcoming item${uncostedUpcomingCount === 1 ? "" : "s"} couldn't be priced from RoadVerdict's benchmark table - worth asking the seller what they'd expect to pay.`
    );
  }
  if (walkAwayIssues.length > 0) {
    discussionPoints.push(
      `This record has ${walkAwayIssues.length} potential walk-away issue${walkAwayIssues.length === 1 ? "" : "s"} flagged above - worth resolving before discussing price at all.`
    );
  }
  if (unconfirmedFindings.length > 0) {
    discussionPoints.push(
      `${unconfirmedFindings.length} area${unconfirmedFindings.length === 1 ? "" : "s"} of this bike's history aren't confirmed by the record (see "What the record can't yet confirm" above) - worth asking about directly.`
    );
  }
  if (evidenceQuality.totalRecords > 0 && evidenceQuality.receiptCoveragePct < LOW_RECEIPT_COVERAGE_THRESHOLD) {
    discussionPoints.push(
      `Only ${evidenceQuality.receiptCoveragePct}% of logged entries have a receipt attached - worth asking to see more before relying on the total spend figure.`
    );
  }

  return { askingPrice, upcomingCostsTotal, uncostedUpcomingCount, discussionPoints };
}