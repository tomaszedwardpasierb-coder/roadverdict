// Place at: src/lib/tracker/walkAwayRisks.ts
//
// Deliberately split into two different kinds of risk, since they need
// very different responses from a buyer. A clean result here is never
// a claim the bike is mechanically sound - it's a claim about what the
// paperwork and logged history show, nothing more. See
// INSPECTION_REQUIRED_RISKS below, always shown regardless of how
// clean the rest of the report looks.
import type { BikeDoc } from "./bike";
import type { EvidenceQuality } from "./evidenceQuality";
import type { MileagePlausibilityCheck } from "./reportNarrative";

export interface WalkAwayIssue {
  label: string;
  detail: string;
}

// A gap this long without a single logged entry means a real stretch
// of the bike's history simply isn't documented - not proof anything
// is wrong, but worth asking the seller to explain, not waving past.
// Named and tunable, not a number chosen once and buried inline.
const MAJOR_GAP_DAYS = 730;

export function buildWalkAwayIssues(
  bike: BikeDoc,
  mileageCheck: MileagePlausibilityCheck,
  evidenceQuality: EvidenceQuality
): WalkAwayIssue[] {
  const issues: WalkAwayIssue[] = [];

  if (bike.dvlaData?.isScrapped) {
    issues.push({ label: "DVLA status", detail: "DVLA has this vehicle recorded as scrapped." });
  }
  if (bike.dvlaData?.isExported) {
    issues.push({ label: "DVLA status", detail: "DVLA has this vehicle recorded as exported." });
  }

  if (mileageCheck.implausible) {
    issues.push({
      label: "Mileage",
      detail: mileageCheck.reason ?? "The current mileage doesn't look plausible given this bike's logged history.",
    });
  }
  if (!evidenceQuality.mileageInternallyConsistent) {
    issues.push({
      label: "Mileage",
      detail: "At least one logged entry shows a lower mileage than an earlier one - worth resolving before relying on the mileage history.",
    });
  }

  if (evidenceQuality.longestGapDays >= MAJOR_GAP_DAYS) {
    const years = Math.round(evidenceQuality.longestGapDays / 365);
    issues.push({
      label: "Documentation gap",
      detail: `No logged activity for around ${years} year${years === 1 ? "" : "s"} at one point - a gap this long leaves a real stretch of this bike's history undocumented.`,
    });
  }

  return issues;
}

// Fixed, not computed - no digital record, however complete, can ever
// verify these without a physical inspection.
export const INSPECTION_REQUIRED_RISKS = [
  "Brake condition and wear",
  "Tyre condition, age, and wear",
  "Frame condition, including any past damage or repair",
  "Engine condition and internal wear",
  "Corrosion, including anywhere not visible without disassembly",
  "Electrical faults",
];