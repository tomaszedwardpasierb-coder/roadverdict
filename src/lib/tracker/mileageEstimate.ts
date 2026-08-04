// Place at: src/lib/tracker/mileageEstimate.ts
//
// Pure, deterministic maths - no AI involved. AI's only role in mileage
// is reading a figure directly off a receipt if one's genuinely printed
// there; this function only runs when that's NOT the case, and it never
// pretends to be exact about it.

export interface MileagePoint {
  date: string;
  mileage: number;
}

export type MileageConfidence = "interpolated" | "estimated";

export interface MileageEstimateResult {
  mileage: number;
  confidence: MileageConfidence;
  // Set only when this specific estimate is on shakier ground than its
  // confidence tier alone conveys - a wide gap to the nearest real point,
  // or no bike-specific pace to go on at all. Purely informational: never
  // blocks anything, just gives a human reviewing it a reason to look
  // twice, surfaced in the review queue and on the flagged card.
  warning?: string;
}

interface BikeLifetime {
  startingMileage: number;
  currentMileage: number;
  dateAdded: string;
}

const FALLBACK_MILES_PER_YEAR = 3000; // last resort only - see warning text below every time this actually gets used
const WIDE_GAP_DAYS = 180; // beyond this, even a real interpolation deserves a caveat
const NEARBY_POINT_DAYS = 90; // "close enough to trust an extrapolation without a caveat"

function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / 86400000;
}

// The bike's own actual average pace, computed from real logged points
// where possible - this is what should drive extrapolation, not a
// generic UK-wide constant. Only falls back to the constant when there
// is genuinely no bike-specific signal to compute a rate from at all.
function overallRatePerDay(sorted: MileagePoint[], bike: BikeLifetime): { rate: number; isBikeSpecific: boolean } {
  if (sorted.length >= 2) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const days = daysBetween(new Date(last.date).getTime(), new Date(first.date).getTime());
    if (days > 0) return { rate: (last.mileage - first.mileage) / days, isBikeSpecific: true };
  }
  const days = daysBetween(Date.now(), new Date(bike.dateAdded).getTime());
  if (days > 0) return { rate: (bike.currentMileage - bike.startingMileage) / days, isBikeSpecific: true };
  return { rate: FALLBACK_MILES_PER_YEAR / 365, isBikeSpecific: false };
}

// Never let a past-dated estimate exceed what the bike has genuinely
// done by today, and never let it go negative - a straightforward
// plausibility floor/ceiling that the old version didn't apply anywhere.
function clampToPlausible(mileage: number, bike: BikeLifetime): number {
  return Math.min(Math.max(Math.round(mileage), 0), bike.currentMileage);
}

export function mileageConfidenceLabel(confidence: "interpolated" | "estimated" | "confirmed"): string {
  if (confidence === "confirmed") return " (mileage confirmed - AI-assisted entry)";
  if (confidence === "interpolated") return " (mileage interpolated)";
  return " (mileage estimated)";
}

// 1. (Handled by the caller, before this runs) - mileage read directly off the receipt.
// 2. Interpolate between two real logged points that bracket the target date.
// 3. Extrapolate from whichever real point exists, using the bike's own actual pace.
// 4. No real points at all - interpolate across the bike's whole known lifetime
//    (starting mileage at dateAdded -> current mileage at today).
// 5. Target date is even before the bike was added - extrapolate backward from
//    startingMileage using the bike's own actual pace (NOT a generic constant),
//    falling back to the generic UK average only when there's truly no
//    bike-specific pace available yet, and flagging that fallback clearly.
export function estimateMileage(targetDate: string, knownPoints: MileagePoint[], bike: BikeLifetime): MileageEstimateResult {
  const target = new Date(targetDate).getTime();
  const sorted = [...knownPoints].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const before = [...sorted].reverse().find((p) => new Date(p.date).getTime() <= target);
  const after = sorted.find((p) => new Date(p.date).getTime() > target);

  if (before && after && before !== after) {
    const t0 = new Date(before.date).getTime();
    const t1 = new Date(after.date).getTime();
    const frac = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
    const mileage = clampToPlausible(before.mileage + frac * (after.mileage - before.mileage), bike);
    const gapDays = daysBetween(t1, t0);
    const warning =
      gapDays > WIDE_GAP_DAYS
        ? `The nearest logged records either side of this date are ${Math.round(gapDays)} days apart - this is a straight-line guess across a wide gap, worth checking if you can.`
        : undefined;
    return { mileage, confidence: "interpolated", warning };
  }

  if (before) {
    const { rate, isBikeSpecific } = overallRatePerDay(sorted, bike);
    const daysSince = daysBetween(target, new Date(before.date).getTime());
    const mileage = clampToPlausible(Math.max(before.mileage, before.mileage + rate * daysSince), bike);
    const warning =
      daysSince > NEARBY_POINT_DAYS
        ? `${Math.round(daysSince)} days on from the nearest earlier record, extrapolated at ${isBikeSpecific ? "this bike's own average pace" : "a generic UK average (no bike-specific pace to go on yet)"}.`
        : undefined;
    return { mileage, confidence: "estimated", warning };
  }

  if (after) {
    const { rate, isBikeSpecific } = overallRatePerDay(sorted, bike);
    const daysBefore = daysBetween(new Date(after.date).getTime(), target);
    const mileage = clampToPlausible(after.mileage - rate * daysBefore, bike);
    const warning =
      daysBefore > NEARBY_POINT_DAYS
        ? `${Math.round(daysBefore)} days before the nearest later record, extrapolated backward at ${isBikeSpecific ? "this bike's own average pace" : "a generic UK average (no bike-specific pace to go on yet)"}.`
        : undefined;
    return { mileage, confidence: "estimated", warning };
  }

  const addedTime = new Date(bike.dateAdded).getTime();
  const nowTime = Date.now();

  if (target >= addedTime) {
    const frac = nowTime > addedTime ? (target - addedTime) / (nowTime - addedTime) : 0;
    const mileage = clampToPlausible(bike.startingMileage + frac * (bike.currentMileage - bike.startingMileage), bike);
    return {
      mileage,
      confidence: "estimated",
      warning: "No logged records at all yet to anchor this - spread evenly across the bike's whole time on RoadVerdict.",
    };
  }

  // Target date is before the bike was even added to RoadVerdict - the
  // exact case that was previously using a flat 3,000 mi/year constant
  // regardless of how this bike is actually ridden. Use its own real
  // pace when one can be computed (from dateAdded/startingMileage vs
  // currentMileage/today), and say so plainly when that's not possible
  // yet and the generic constant is the only thing left to fall back on.
  const { rate, isBikeSpecific } = overallRatePerDay(sorted, bike);
  const daysBeforeAdded = daysBetween(addedTime, target);
  const mileage = clampToPlausible(bike.startingMileage - rate * daysBeforeAdded, bike);
  const warning = isBikeSpecific
    ? `From before this bike was added to RoadVerdict - extrapolated backward ${Math.round(daysBeforeAdded)} days at this bike's own average pace.`
    : `From before this bike was added to RoadVerdict, and there's no bike-specific pace yet to extrapolate from - this uses a generic UK average (${FALLBACK_MILES_PER_YEAR} mi/year) instead, which may be well off for how this bike is actually ridden. Worth double-checking against memory or another receipt from around this date.`;
  return { mileage, confidence: "estimated", warning };
}
