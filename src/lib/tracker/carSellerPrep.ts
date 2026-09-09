// Place at: src/lib/tracker/carSellerPrep.ts
//
// Car equivalent of sellerPrep.ts. buildSellerPrepPlan is reused
// directly from that file (already fully vehicle-neutral - no
// "bike"/"car" wording anywhere in it), only buildSellerPrepIssues is
// mirrored here, since its one fallback string mentions "bike".
import type { CarWalkAwayIssue } from "./carWalkAwayRisks";

export interface CarSellerPrepIssue {
  label: string;
  detail: string;
  suggestion: string;
}

// Keyed by CarWalkAwayIssue's own label field - a small, known set (see
// carWalkAwayRisks.ts). Falls back to a generic prompt for any future
// label added there that this file hasn't been updated to cover yet.
const SUGGESTIONS_BY_LABEL: Record<string, string> = {
  "DVLA status":
    "If this is incorrect, get it corrected with DVLA before listing - a buyer will check this independently, and it's far better resolved before they ask than explained after.",
  "Mileage":
    "Worth checking your own logged entries for a typo or one entered out of order - fixing this directly is usually quicker and more convincing than explaining it to a buyer later.",
  "Documentation gap":
    "A gap like this reads very differently once it's explained - even a short note on what happened during this period (stored, off the road, between owners' hands) is far better than an unexplained silence.",
};

export function buildCarSellerPrepIssues(walkAwayIssues: CarWalkAwayIssue[]): CarSellerPrepIssue[] {
  return walkAwayIssues.map((issue) => ({
    label: issue.label,
    detail: issue.detail,
    suggestion: SUGGESTIONS_BY_LABEL[issue.label] ?? "Worth addressing or documenting before you list this car for sale.",
  }));
}
