// Place at: src/lib/tracker/sellerReportVerdict.ts
//
// Deliberately produces a documentation-quality verdict, not a
// trustworthiness-of-the-person verdict - the data can genuinely support
// the first; it can't honestly support the second. Every reason string
// traces directly to one of the input metrics, all of which are computed
// elsewhere by deterministic code (backdateCheck.ts, mileageAudit.ts,
// reminderStatus.ts) - this file only decides which tier those numbers
// add up to and states the facts plainly, the same "factual, not
// accusatory" house style backdateCheck.ts itself already established.

export type SellerVerdictTier = "well-documented" | "partially-documented" | "limited-documentation";

export interface SellerVerdictMetrics {
  totalEntries: number;
  receiptCount: number;
  // Entries inside a detected bulk-backdating cluster - not just "logged
  // a bit late", which is normal, but "a chunk of history typed in one
  // sitting", which is the specific pattern worth flagging.
  entriesInBulkClusters: number;
  largestClusterSpanDays: number;
  mileageViolationCount: number;
  longestGapDays: number;
  spanYears: number;
  overdueReminderCount: number;
  totalReminderCount: number;
  recentRegistrationChangeDays: number | null;
}

export interface SellerVerdictResult {
  tier: SellerVerdictTier;
  label: string;
  reasons: string[];
}

const RECEIPT_COVERAGE_GOOD = 0.7;
const RECEIPT_COVERAGE_POOR = 0.3;
const PROGRESSIVE_LOGGING_GOOD = 0.7;
const LARGE_CLUSTER_SPAN_DAYS = 180;
const RECENT_REGISTRATION_CHANGE_DAYS = 30;

function pct(n: number, total: number): number {
  return total > 0 ? n / total : 1;
}

export function computeSellerVerdict(m: SellerVerdictMetrics): SellerVerdictResult {
  const receiptCoverage = pct(m.receiptCount, m.totalEntries);
  const progressiveLogging = 1 - pct(m.entriesInBulkClusters, m.totalEntries);
  const reasons: string[] = [];

  // Evidence lines first, tier decided from the same facts below - so
  // the reasons list is never trying to justify a conclusion reached
  // some other way.
  if (m.totalEntries > 0) {
    reasons.push(
      `${m.receiptCount} of ${m.totalEntries} entries (${Math.round(receiptCoverage * 100)}%) have a receipt or invoice attached`
    );
    reasons.push(
      `${m.totalEntries - m.entriesInBulkClusters} of ${m.totalEntries} entries were logged individually over time, not as a bulk backfill`
    );
  }
  reasons.push(
    m.mileageViolationCount === 0
      ? `No mileage inconsistencies found across ${m.spanYears.toFixed(1)} years of history`
      : `${m.mileageViolationCount} unresolved mileage inconsistenc${m.mileageViolationCount === 1 ? "y" : "ies"} in the logged history`
  );
  if (m.totalReminderCount > 0) {
    reasons.push(
      m.overdueReminderCount === 0
        ? "No maintenance reminders are currently overdue"
        : `${m.overdueReminderCount} of ${m.totalReminderCount} maintenance reminder${m.overdueReminderCount === 1 ? "" : "s"} currently overdue`
    );
  }
  if (m.recentRegistrationChangeDays !== null && m.recentRegistrationChangeDays <= RECENT_REGISTRATION_CHANGE_DAYS) {
    reasons.push(`Registration changed ${m.recentRegistrationChangeDays} day${m.recentRegistrationChangeDays === 1 ? "" : "s"} before this report was generated`);
  }
  if (m.largestClusterSpanDays >= LARGE_CLUSTER_SPAN_DAYS) {
    reasons.push(`A single logging session covered ${Math.round(m.largestClusterSpanDays / 30)} months of claimed history at once`);
  }

  let tier: SellerVerdictTier;
  if (
    m.totalEntries === 0 ||
    m.mileageViolationCount > 0 ||
    m.largestClusterSpanDays >= LARGE_CLUSTER_SPAN_DAYS ||
    receiptCoverage < RECEIPT_COVERAGE_POOR
  ) {
    tier = "limited-documentation";
  } else if (
    receiptCoverage < RECEIPT_COVERAGE_GOOD ||
    progressiveLogging < PROGRESSIVE_LOGGING_GOOD ||
    m.overdueReminderCount > 0 ||
    (m.recentRegistrationChangeDays !== null && m.recentRegistrationChangeDays <= RECENT_REGISTRATION_CHANGE_DAYS) ||
    m.entriesInBulkClusters > 0
  ) {
    tier = "partially-documented";
  } else {
    tier = "well-documented";
  }

  const label =
    tier === "well-documented" ? "Well documented" : tier === "partially-documented" ? "Partially documented" : "Limited documentation";

  return { tier, label, reasons };
}
