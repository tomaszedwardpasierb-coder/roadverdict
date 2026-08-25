// Place at: src/lib/tracker/evidenceQuality.ts
//
// Answers a narrower, more useful question than a single confidence
// score could - not "how good is this record" as one number, but the
// specific, checkable facts a buyer would want before trusting it. See
// sellerReportVerdict.ts for the separate, existing documentation
// verdict this doesn't replace or duplicate - that produces an overall
// label; this exposes the individual signals underneath it, several of
// which (longestGapDays, mileageViolationCount) were already computed
// there as part of verdictMetrics but never surfaced to the report
// itself. Every field here is a plain count or percentage, nothing
// inferred or judged.

export interface EvidenceQuality {
  totalRecords: number;
  receiptCount: number;
  receiptCoveragePct: number;
  realTimeCount: number;
  realTimePct: number;
  longestGapDays: number;
  mileageInternallyConsistent: boolean;
}

export function buildEvidenceQuality(
  totalRecords: number,
  receiptCount: number,
  realTimeCount: number,
  longestGapDays: number,
  mileageViolationCount: number
): EvidenceQuality {
  return {
    totalRecords,
    receiptCount,
    receiptCoveragePct: totalRecords > 0 ? Math.round((receiptCount / totalRecords) * 100) : 0,
    realTimeCount,
    realTimePct: totalRecords > 0 ? Math.round((realTimeCount / totalRecords) * 100) : 0,
    longestGapDays,
    mileageInternallyConsistent: mileageViolationCount === 0,
  };
}