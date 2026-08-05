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
  // Set whenever this specific estimate is on shakier ground than its
  // confidence tier alone conveys.
  warning?: string;
  // True when there's no real anchor close enough to trust ANY computed
  // number, in either direction - rather than silently showing a
  // fallback figure a busy reviewer might wave through unread, the
  // caller should present this as a genuinely blank, required field
  // instead of a pre-filled suggestion. `mileage` still carries a
  // provisional placeholder (the nearest real anchor) so callers that
  // must write a number immediately - the record schema requires one -
  // have something to store until a human actually fills it in.
  requiresManualEntry: boolean;
}

interface BikeLifetime {
  startingMileage: number;
  currentMileage: number;
  dateAdded: string;
}

const FALLBACK_MILES_PER_YEAR = 3000; // last resort only - see warning text below every time this actually gets used
const WIDE_GAP_DAYS = 180; // beyond this, even a real interpolation deserves a caveat
const NEARBY_POINT_DAYS = 90; // "close enough to trust an extrapolation without a caveat"
// A rate computed from a short observed window has almost no evidentiary
// weight far outside that window - trusting it anyway is exactly how a
// bike added to RoadVerdict a week ago, showing a completely normal
// recent pace, ends up "confidently" extrapolated back through zero for
// a receipt from three years earlier. Cap how far a computed rate is
// allowed to speak: at most a multiple of its own observed window, and
// never more than an absolute ceiling regardless of how long that window is.
// Past that point, don't guess at all - ask instead.
const MAX_EXTRAPOLATION_MULTIPLE = 3;
const MAX_EXTRAPOLATION_DAYS_HARD_CAP = 730;

function daysBetween(a: number, b: number): number {
  return Math.abs(a - b) / 86400000;
}

function trustedExtrapolationDays(observedWindowDays: number): number {
  return Math.min(observedWindowDays * MAX_EXTRAPOLATION_MULTIPLE, MAX_EXTRAPOLATION_DAYS_HARD_CAP);
}

// The bike's own actual average pace, computed from real logged points
// where possible - this is what should drive extrapolation, not a
// generic UK-wide constant. Only falls back to the constant when there
// is genuinely no bike-specific signal to compute a rate from at all.
// Also returns the size of the window the rate was actually observed
// over, so callers know how far it's reasonable to trust it.
function overallRatePerDay(
  sorted: MileagePoint[],
  bike: BikeLifetime
): { rate: number; isBikeSpecific: boolean; observedWindowDays: number } {
  if (sorted.length >= 2) {
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const days = daysBetween(new Date(last.date).getTime(), new Date(first.date).getTime());
    if (days > 0) return { rate: (last.mileage - first.mileage) / days, isBikeSpecific: true, observedWindowDays: days };
  }
  const days = daysBetween(Date.now(), new Date(bike.dateAdded).getTime());
  if (days > 0) return { rate: (bike.currentMileage - bike.startingMileage) / days, isBikeSpecific: true, observedWindowDays: days };
  return { rate: FALLBACK_MILES_PER_YEAR / 365, isBikeSpecific: false, observedWindowDays: 0 };
}

function clampToPlausible(mileage: number, bike: BikeLifetime): number {
  return Math.min(Math.max(Math.round(mileage), 0), bike.currentMileage);
}

export function mileageConfidenceLabel(confidence: "interpolated" | "estimated" | "confirmed"): string {
  if (confidence === "confirmed") return " (mileage confirmed - AI-assisted entry)";
  if (confidence === "interpolated") return " (mileage interpolated)";
  return " (mileage estimated)";
}

// Matches costCalculator.ts's AVERAGE_MOTORCYCLE_MPG exactly - kept as a
// separate local constant rather than importing it, since that file's
// own dependency chain touches Cosmos (via fuelPrice.ts), and importing
// from it here would drag the Cosmos SDK into every client component
// that currently safely imports mileageConfidenceLabel from this same
// file. If the Cost Calculator's figure is ever revised, update both.
const GENERIC_MPG_FALLBACK = 57;

export interface FuelMileageEstimateResult {
  mileage: number;
  confidence: "estimated";
  warning: string;
  requiresManualEntry: false;
}

// Litres-informed estimate for a fuel receipt with no mileage printed -
// a materially better guess than pure date-based interpolation, since
// fuel consumed and distance travelled are causally linked in a way
// "how many days have passed" simply isn't. Only valid for a genuine
// FULL TANK fill-up, and only with a real full-tank fill-up to project
// forward from - same restriction as fuelPlausibility.ts's plausibility
// check, and for the same reason: a partial top-up doesn't cleanly
// correspond to "this many litres = this much distance since the last
// full tank", and there's nothing to measure forward FROM without one.
// Returns null in either case, so the caller falls back to the generic
// date-based estimate instead.
export function estimateFuelMileageFromLitres(
  litres: number,
  precedingFullTankMileage: number | null,
  bikeOwnAverageMpg: number | null,
  bike: BikeLifetime
): FuelMileageEstimateResult | null {
  if (precedingFullTankMileage === null || litres <= 0) return null;
  const usedGenericMpg = bikeOwnAverageMpg === null || bikeOwnAverageMpg <= 0;
  const mpgToUse = usedGenericMpg ? GENERIC_MPG_FALLBACK : (bikeOwnAverageMpg as number);
  const gallons = litres / 4.546;
  const estimatedMiles = gallons * mpgToUse;
  const mileage = clampToPlausible(precedingFullTankMileage + estimatedMiles, bike);
  const warning = usedGenericMpg
    ? `Estimated from ${litres.toFixed(1)}L at a generic ${GENERIC_MPG_FALLBACK}mpg UK average (no fuel history yet to use this bike's own figure instead) - please check this is close to right.`
    : `Estimated from ${litres.toFixed(1)}L at this bike's own average of ${Math.round(mpgToUse)}mpg - please check this is close to right.`;
  return { mileage, confidence: "estimated", warning, requiresManualEntry: false };
}

// 1. (Handled by the caller, before this runs) - mileage read directly off the receipt.
// 2. Interpolate between two real logged points that bracket the target date - always
//    automatic, since it's bounded and can't produce an implausible number by construction.
// 3. Extrapolate from whichever single real point exists, using the bike's own actual
//    pace - but only within that pace's own trusted distance. Beyond it, don't guess:
//    require a human to provide the real figure.
// 4. No real points at all, date within the bike's time on RoadVerdict - interpolate
//    across its whole known lifetime (bounded by two real numbers the owner themselves
//    provided when adding the bike, so this stays automatic).
// 5. Target date is before the bike was even added - same trust-distance rule as (3).
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
    return { mileage, confidence: "interpolated", warning, requiresManualEntry: false };
  }

  if (before) {
    const { rate, isBikeSpecific, observedWindowDays } = overallRatePerDay(sorted, bike);
    const daysSince = daysBetween(target, new Date(before.date).getTime());
    const trustedDays = trustedExtrapolationDays(observedWindowDays);
    if (daysSince > trustedDays) {
      return {
        mileage: before.mileage,
        confidence: "estimated",
        warning: `${Math.round(daysSince)} days on from the nearest earlier record - too far past the ${Math.round(observedWindowDays)}-day span this bike's pace was actually measured over to trust a guess. Please enter the real mileage if you know it.`,
        requiresManualEntry: true,
      };
    }
    const mileage = clampToPlausible(Math.max(before.mileage, before.mileage + rate * daysSince), bike);
    const warning =
      daysSince > NEARBY_POINT_DAYS
        ? `${Math.round(daysSince)} days on from the nearest earlier record, extrapolated at ${isBikeSpecific ? "this bike's own average pace" : "a generic UK average (no bike-specific pace to go on yet)"}.`
        : undefined;
    return { mileage, confidence: "estimated", warning, requiresManualEntry: false };
  }

  if (after) {
    const { rate, isBikeSpecific, observedWindowDays } = overallRatePerDay(sorted, bike);
    const daysBefore = daysBetween(new Date(after.date).getTime(), target);
    const trustedDays = trustedExtrapolationDays(observedWindowDays);
    if (daysBefore > trustedDays) {
      return {
        mileage: after.mileage,
        confidence: "estimated",
        warning: `${Math.round(daysBefore)} days before the nearest later record - too far past the ${Math.round(observedWindowDays)}-day span this bike's pace was actually measured over to trust a guess. This looks like the oldest record for this bike so far - please enter the real mileage if you know it.`,
        requiresManualEntry: true,
      };
    }
    const mileage = clampToPlausible(after.mileage - rate * daysBefore, bike);
    const warning =
      daysBefore > NEARBY_POINT_DAYS
        ? `${Math.round(daysBefore)} days before the nearest later record, extrapolated backward at ${isBikeSpecific ? "this bike's own average pace" : "a generic UK average (no bike-specific pace to go on yet)"}.`
        : undefined;
    return { mileage, confidence: "estimated", warning, requiresManualEntry: false };
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
      requiresManualEntry: false,
    };
  }

  // Target date is before the bike was even added to RoadVerdict - this
  // is very often the genuinely oldest record for this bike. Same
  // trust-distance rule: only extrapolate backward from startingMileage
  // as far as the bike's own observed pace can reasonably be trusted;
  // beyond that, or with no bike-specific pace at all yet, ask instead.
  const { rate, isBikeSpecific, observedWindowDays } = overallRatePerDay(sorted, bike);
  const daysBeforeAdded = daysBetween(addedTime, target);
  const trustedDays = trustedExtrapolationDays(observedWindowDays);
  if (!isBikeSpecific || daysBeforeAdded > trustedDays) {
    return {
      mileage: bike.startingMileage,
      confidence: "estimated",
      warning: isBikeSpecific
        ? `From before this bike was added to RoadVerdict, and ${Math.round(daysBeforeAdded)} days further back than the ${Math.round(observedWindowDays)}-day span its pace was actually measured over - too far to trust a guess. This looks like the oldest record for this bike so far - please enter the real mileage if you know it.`
        : `From before this bike was added to RoadVerdict, with no bike-specific pace yet to go on. This looks like the oldest record for this bike so far - please enter the real mileage if you know it.`,
      requiresManualEntry: true,
    };
  }
  const mileage = clampToPlausible(bike.startingMileage - rate * daysBeforeAdded, bike);
  const warning = `From before this bike was added to RoadVerdict - extrapolated backward ${Math.round(daysBeforeAdded)} days at this bike's own average pace.`;
  return { mileage, confidence: "estimated", warning, requiresManualEntry: false };
}
