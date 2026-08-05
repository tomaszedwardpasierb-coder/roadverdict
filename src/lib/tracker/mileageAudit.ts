// Place at: src/lib/tracker/mileageAudit.ts
//
// Mileage cannot decrease over time - that's a mathematical fact about
// how odometers work, not a heuristic. This never tries to guess what
// the right number should have been (only a human or a real receipt
// knows that); it only finds records worth a second look, by checking
// each one against its immediate chronological neighbours rather than a
// single running lifetime max/min - a bad guess is caught locally
// instead of falsely dragging every later record in with it.

import { checkFullTankPlausibility } from "@/lib/tracker/fuelPlausibility";

export interface AuditableRecord {
  id: string;
  date: string;
  mileage: number;
  // Only records that were ever AI-derived (estimated, interpolated, or
  // confirmed-after-being-AI-derived) get flagged - a mileage a human
  // typed in from scratch is their own figure, not something this tool
  // second-guesses, even if it happens to look inconsistent.
  mileageConfidence?: "interpolated" | "estimated" | "confirmed";
}

export function findMileageMonotonicityViolations(records: AuditableRecord[]): string[] {
  const sorted = [...records].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const violating: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const r = sorted[i];
    if (r.mileageConfidence === undefined) continue;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    const lowerThanEarlier = prev !== undefined && r.mileage < prev.mileage;
    const higherThanLater = next !== undefined && r.mileage > next.mileage;
    if (lowerThanEarlier || higherThanLater) violating.push(r.id);
  }

  return violating;
}

export interface AuditableFuelLog extends AuditableRecord {
  litres: number;
  filledToFull: boolean;
}

// Same principle as the monotonicity check, for the physical-plausibility
// side: a full-tank fill-up whose litres imply an impossible mpg against
// the fill immediately before it (by mileage, not upload order) is
// provably wrong regardless of who or what created it - re-flags the
// LATER of the two fills, since that's the one whose mileage doesn't add
// up against everything already established before it.
export function findImplausibleFuelFills(fuelLogs: AuditableFuelLog[]): string[] {
  const sorted = [...fuelLogs].sort((a, b) => a.mileage - b.mileage);
  const violating: string[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current.mileageConfidence === undefined || !current.filledToFull) continue;
    const preceding = sorted[i - 1];
    const check = checkFullTankPlausibility(current.litres, current.mileage, [{ mileage: preceding.mileage }]);
    if (check && !check.plausible) violating.push(current.id);
  }

  return violating;
}
