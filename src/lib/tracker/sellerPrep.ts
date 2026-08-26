// Place at: src/lib/tracker/sellerPrep.ts
//
// The owner-facing mirror of what a buyer's report shows - same
// underlying facts (walkAwayRisks.ts, evidenceQuality.ts,
// upcomingCosts.ts, reportNarrative.ts's detailedQuestions), reframed
// as things the owner can act on before a buyer ever sees them, not
// restated as findings about a stranger's bike. Deliberately never
// softens or omits a genuine issue - a fixed or explained weak point
// reads better to a buyer than an unaddressed one, so the honest
// version is also the version that serves the owner's own sale price.

import type { WalkAwayIssue } from "./walkAwayRisks";

export interface SellerPrepIssue {
  label: string;
  detail: string;
  suggestion: string;
}

// Keyed by WalkAwayIssue's own label field - a small, known set (see
// walkAwayRisks.ts). Falls back to a generic prompt for any future
// label added there that this file hasn't been updated to cover yet,
// rather than silently showing no suggestion at all.
const SUGGESTIONS_BY_LABEL: Record<string, string> = {
  "DVLA status":
    "If this is incorrect, get it corrected with DVLA before listing - a buyer will check this independently, and it's far better resolved before they ask than explained after.",
  "Mileage":
    "Worth checking your own logged entries for a typo or one entered out of order - fixing this directly is usually quicker and more convincing than explaining it to a buyer later.",
  "Documentation gap":
    "A gap like this reads very differently once it's explained - even a short note on what happened during this period (stored, off the road, between owners' hands) is far better than an unexplained silence.",
};

export function buildSellerPrepIssues(walkAwayIssues: WalkAwayIssue[]): SellerPrepIssue[] {
  return walkAwayIssues.map((issue) => ({
    label: issue.label,
    detail: issue.detail,
    suggestion: SUGGESTIONS_BY_LABEL[issue.label] ?? "Worth addressing or documenting before you list this bike for sale.",
  }));
}

export interface PrepStep {
  stage: string;
  detail: string;
}

export function buildSellerPrepPlan(
  receiptCoveragePct: number,
  issueCount: number,
  overdueUpcomingCount: number,
  questionCount: number
): PrepStep[] {
  const steps: PrepStep[] = [];

  if (receiptCoveragePct < 100) {
    steps.push({
      stage: "Attach missing receipts",
      detail: `${receiptCoveragePct}% of your logged entries currently have a receipt attached - a buyer's report shows this figure directly, so adding what you still have before listing strengthens the record.`,
    });
  }
  if (issueCount > 0) {
    steps.push({
      stage: "Resolve or explain flagged issues",
      detail: `${issueCount} issue${issueCount === 1 ? "" : "s"} flagged below - fix what's genuinely fixable, and prepare a clear, honest explanation for anything that isn't.`,
    });
  }
  if (overdueUpcomingCount > 0) {
    steps.push({
      stage: "Consider handling overdue items now",
      detail: `${overdueUpcomingCount} overdue item${overdueUpcomingCount === 1 ? "" : "s"} listed below - a buyer's report will show these regardless and factor them into any offer, so getting ahead of them can be worth more than the job costs.`,
    });
  }
  if (questionCount > 0) {
    steps.push({
      stage: "Prepare your answers",
      detail: `${questionCount} question${questionCount === 1 ? "" : "s"} a buyer is likely to raise, listed below - a ready, specific answer reads as confidence, not evasion.`,
    });
  }
  steps.push({
    stage: "Review your full record",
    detail: "Look through everything above the way a buyer eventually will - it's the same record they'll see.",
  });

  return steps;
}