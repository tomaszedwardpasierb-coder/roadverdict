// Place at: src/lib/tracker/carWalkAwayRisks.ts
//
// Car equivalent of walkAwayRisks.ts - same split between computed
// risks and the fixed, inspection-only list, just against a CarDoc and
// with a car-appropriate inspection list (bodywork/chassis instead of
// frame, plus cambelt/timing since that's a car-specific catastrophic-
// failure risk with no motorcycle equivalent).
import type { CarDoc } from "./car";
import type { EvidenceQuality } from "./evidenceQuality";
import type { CarMileagePlausibilityCheck } from "./carReportNarrative";

export interface CarWalkAwayIssue {
  label: string;
  detail: string;
}

// A gap this long without a single logged entry means a real stretch
// of the car's history simply isn't documented - not proof anything is
// wrong, but worth asking the seller to explain, not waving past.
const MAJOR_GAP_DAYS = 730;

export function buildCarWalkAwayIssues(
  car: CarDoc,
  mileageCheck: CarMileagePlausibilityCheck,
  evidenceQuality: EvidenceQuality
): CarWalkAwayIssue[] {
  const issues: CarWalkAwayIssue[] = [];

  if (car.dvlaData?.isScrapped) {
    issues.push({ label: "DVLA status", detail: "DVLA has this vehicle recorded as scrapped." });
  }
  if (car.dvlaData?.isExported) {
    issues.push({ label: "DVLA status", detail: "DVLA has this vehicle recorded as exported." });
  }

  if (mileageCheck.implausible) {
    issues.push({
      label: "Mileage",
      detail: mileageCheck.reason ?? "The current mileage doesn't look plausible given this car's logged history.",
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
      detail: `No logged activity for around ${years} year${years === 1 ? "" : "s"} at one point - a gap this long leaves a real stretch of this car's history undocumented.`,
    });
  }

  return issues;
}

// Fixed, not computed - no digital record, however complete, can ever
// verify these without a physical inspection.
export const CAR_INSPECTION_REQUIRED_RISKS = [
  "Brake condition and wear",
  "Tyre condition, age, and wear",
  "Bodywork and chassis condition, including any past accident damage or repair",
  "Engine condition and internal wear",
  "Cambelt/timing chain condition, if not confirmed by logged history",
  "Corrosion, including anywhere not visible without disassembly",
  "Electrical faults",
];
