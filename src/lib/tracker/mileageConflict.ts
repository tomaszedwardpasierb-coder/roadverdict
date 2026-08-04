// Place at: src/lib/tracker/mileageConflict.ts
//
// The point-of-entry counterpart to mileageAudit.ts: that tool finds
// violations already sitting in the database; this one checks a single
// new value BEFORE it's saved, so a new violation gets caught the
// moment it's created rather than waiting for someone to remember to
// run the audit. Deliberately checked against every other record, not
// just immediate neighbours - for a single incoming save, "is there any
// earlier record with higher mileage, or any later record with lower
// mileage" is the correct, complete question, not an approximation.

export interface MileageConflictCandidate {
  id: string;
  date: string;
  mileage: number;
}

export interface MileageConflict {
  date: string;
  mileage: number;
  direction: "earlier-but-higher" | "later-but-lower";
}

// excludeId lets an edit check against every OTHER record without
// flagging itself for its own pre-edit value.
export function findMileageConflict(
  candidateDate: string,
  candidateMileage: number,
  excludeId: string | null,
  existing: MileageConflictCandidate[]
): MileageConflict | null {
  const candidateTime = new Date(candidateDate).getTime();
  let closest: MileageConflict | null = null;
  let closestGapMs = Infinity;

  for (const r of existing) {
    if (r.id === excludeId) continue;
    const rTime = new Date(r.date).getTime();
    const gap = Math.abs(rTime - candidateTime);

    if (rTime < candidateTime && r.mileage > candidateMileage && gap < closestGapMs) {
      closest = { date: r.date, mileage: r.mileage, direction: "earlier-but-higher" };
      closestGapMs = gap;
    }
    if (rTime > candidateTime && r.mileage < candidateMileage && gap < closestGapMs) {
      closest = { date: r.date, mileage: r.mileage, direction: "later-but-lower" };
      closestGapMs = gap;
    }
  }

  return closest;
}

export function describeMileageConflict(conflict: MileageConflict): string {
  const d = new Date(conflict.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return conflict.direction === "earlier-but-higher"
    ? `This is lower than a record from ${d} (${conflict.mileage.toLocaleString()} mi) - mileage can't go down over time. Please check the figure.`
    : `This is higher than a record from ${d} (${conflict.mileage.toLocaleString()} mi) - mileage can't go down over time. Please check the figure.`;
}
