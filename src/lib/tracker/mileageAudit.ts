// Place at: src/lib/tracker/mileageAudit.ts
//
// Mileage cannot decrease over time - that's a mathematical fact about
// how odometers work, not a heuristic. This never tries to guess what
// the right number should have been (only a human or a real receipt
// knows that); it only finds records worth a second look, by checking
// each one against its immediate chronological neighbours rather than a
// single running lifetime max/min - a bad guess is caught locally
// instead of falsely dragging every later record in with it.

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
