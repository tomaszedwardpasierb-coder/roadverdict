// Place at: src/lib/tracker/mileageEstimate.ts
//
// Pure, deterministic maths - no AI involved. AI's only role in mileage
// is reading a figure directly off a receipt if one's printed there;
// this function only runs when that's NOT the case, and it never
// pretends to be exact about it.

export interface MileagePoint {
  date: string;
  mileage: number;
}

export type MileageConfidence = "interpolated" | "estimated";

export interface MileageEstimateResult {
  mileage: number;
  confidence: MileageConfidence;
}

interface BikeLifetime {
  startingMileage: number;
  currentMileage: number;
  dateAdded: string;
}

const FALLBACK_MILES_PER_YEAR = 3000; // a reasonable UK average, used only when there's truly nothing else to go on

function overallRatePerDay(sorted: MileagePoint[], bike: BikeLifetime): number {
  if (sorted.length >= 2) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
    if (days > 0) return (last.mileage - first.mileage) / days;
  }
  const days = (Date.now() - new Date(bike.dateAdded).getTime()) / 86400000;
  if (days > 0) return (bike.currentMileage - bike.startingMileage) / days;
  return FALLBACK_MILES_PER_YEAR / 365;
}

// Shared display wording for the three confidence states, used by every
// history card that shows mileage. "confirmed" specifically means the
// record originated from AI-scanning but a human has since reviewed and
// saved it - kept distinct from still-unreviewed, since the figure isn't
// merely "estimated" any more once someone's actually looked at it.
export function mileageConfidenceLabel(confidence: "interpolated" | "estimated" | "confirmed"): string {
  if (confidence === "confirmed") return " (mileage confirmed - AI-assisted entry)";
  if (confidence === "interpolated") return " (mileage interpolated)";
  return " (mileage estimated)";
}
// 1. (Handled by the caller, before this runs) - mileage read directly off the receipt.
// 2. Interpolate between two real logged points that bracket the target date.
// 3. Extrapolate from whichever real points exist, using the bike's own overall rate.
// 4. No real points at all - interpolate across the bike's whole known lifetime
//    (starting mileage at dateAdded -> current mileage at today), or a flat
//    typical-usage rate if the target date is even before that.
export function estimateMileage(targetDate: string, knownPoints: MileagePoint[], bike: BikeLifetime): MileageEstimateResult {
  const target = new Date(targetDate).getTime();
  const sorted = [...knownPoints].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const before = [...sorted].reverse().find((p) => new Date(p.date).getTime() <= target);
  const after = sorted.find((p) => new Date(p.date).getTime() > target);

  if (before && after && before !== after) {
    const t0 = new Date(before.date).getTime();
    const t1 = new Date(after.date).getTime();
    const frac = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
    const mileage = Math.round(before.mileage + frac * (after.mileage - before.mileage));
    return { mileage: Math.max(mileage, 0), confidence: "interpolated" };
  }

  if (before) {
    const rate = overallRatePerDay(sorted, bike);
    const daysSince = (target - new Date(before.date).getTime()) / 86400000;
    const mileage = Math.round(before.mileage + rate * daysSince);
    return { mileage: Math.max(mileage, before.mileage), confidence: "estimated" };
  }

  if (after) {
    const rate = overallRatePerDay(sorted, bike);
    const daysBefore = (new Date(after.date).getTime() - target) / 86400000;
    const mileage = Math.round(after.mileage - rate * daysBefore);
    return { mileage: Math.max(mileage, 0), confidence: "estimated" };
  }

  const addedTime = new Date(bike.dateAdded).getTime();
  const nowTime = Date.now();
  if (target >= addedTime) {
    const frac = nowTime > addedTime ? (target - addedTime) / (nowTime - addedTime) : 0;
    const mileage = Math.round(bike.startingMileage + frac * (bike.currentMileage - bike.startingMileage));
    return { mileage: Math.min(Math.max(mileage, 0), bike.currentMileage), confidence: "estimated" };
  }
  const daysBefore = (addedTime - target) / 86400000;
  const mileage = Math.max(Math.round(bike.startingMileage - (FALLBACK_MILES_PER_YEAR / 365) * daysBefore), 0);
  return { mileage, confidence: "estimated" };
}
