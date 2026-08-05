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
  // Optional - a batch hint (a not-yet-committed receipt elsewhere in
  // the same scan, known only by its date and a mileage actually
  // printed on it) has no database id yet. Only real records need one,
  // so excludeId can skip past the record currently being edited.
  id?: string;
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
    if (excludeId && r.id === excludeId) continue;
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

// Used to hard-reject a human-submitted save (the manual log forms, any
// edit, the review queue) - names the exact bound the number needs to
// respect, not just that something's wrong, so the person can fix it in
// one try rather than guessing again.
export function describeMileageConflict(conflict: MileageConflict): string {
  const d = new Date(conflict.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const m = conflict.mileage.toLocaleString();
  return conflict.direction === "earlier-but-higher"
    ? `This mileage can't be saved because it would make the mileage go down over time. A record from ${d} already shows ${m} miles, and that's earlier than this one. Enter ${m} miles or more to keep the timeline consistent.`
    : `This mileage can't be saved because it would make the mileage go down over time. A record from ${d} already shows ${m} miles, and that's later than this one. Enter ${m} miles or fewer to keep the timeline consistent.`;
}
