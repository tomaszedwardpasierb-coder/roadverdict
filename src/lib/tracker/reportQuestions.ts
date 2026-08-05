// Place at: src/lib/tracker/reportQuestions.ts
//
// Same metrics, same thresholds as sellerReportVerdict.ts - deliberately
// reused rather than re-derived, so a condition is never "notable enough
// to flag" in one place but not the other. Turns each flagged condition
// into a specific question instead of a passive warning - the
// difference between information and something a buyer actually carries
// into a conversation with the seller.

import type { SellerVerdictMetrics } from "./sellerReportVerdict";
import {
  RECEIPT_COVERAGE_POOR,
  PROGRESSIVE_LOGGING_GOOD,
  LARGE_CLUSTER_SPAN_DAYS,
  RECENT_REGISTRATION_CHANGE_DAYS,
  pct,
} from "./sellerReportVerdict";

export function generateBuyerQuestions(m: SellerVerdictMetrics): string[] {
  const questions: string[] = [];
  const receiptCoverage = pct(m.receiptCount, m.totalEntries);
  const progressiveLogging = 1 - pct(m.entriesInBulkClusters, m.totalEntries);

  if (m.largestClusterSpanDays >= LARGE_CLUSTER_SPAN_DAYS) {
    questions.push(
      `Ask why ${Math.round(m.largestClusterSpanDays / 30)} months of history was logged in one sitting, and whether receipts exist for those entries.`
    );
  } else if (progressiveLogging < PROGRESSIVE_LOGGING_GOOD && m.entriesInBulkClusters > 0) {
    questions.push("Ask why some of the history was logged in batches rather than as things happened.");
  }

  if (m.mileageViolationCount > 0) {
    questions.push(
      `Ask the seller to explain the mileage discrepanc${m.mileageViolationCount === 1 ? "y" : "ies"} in the logged history - the figures don't line up cleanly on their own.`
    );
  }

  if (receiptCoverage < RECEIPT_COVERAGE_POOR) {
    questions.push("Ask to see physical receipts or invoices for the work claimed - very few are attached here.");
  }

  if (m.overdueReminderCount > 0) {
    questions.push(
      `Ask when the ${m.overdueReminderCount === 1 ? "overdue item" : `${m.overdueReminderCount} overdue items`} shown below w${m.overdueReminderCount === 1 ? "as" : "ere"} last actually checked.`
    );
  }

  if (m.recentRegistrationChangeDays !== null && m.recentRegistrationChangeDays <= RECENT_REGISTRATION_CHANGE_DAYS) {
    questions.push(`Ask why the registration changed ${m.recentRegistrationChangeDays} day${m.recentRegistrationChangeDays === 1 ? "" : "s"} before this bike was listed.`);
  }

  // Always worth asking, regardless of what the logged history shows -
  // this data is self-reported and was never claimed to be independently
  // verified, so cross-checking it is always sensible, not just when
  // something looks off.
  questions.push("Cross-check the claimed mileage against the DVSA MOT history using the link below - it's independent of anything RoadVerdict shows.");

  return questions;
}
