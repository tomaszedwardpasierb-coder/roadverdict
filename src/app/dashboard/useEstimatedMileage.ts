// Place at: src/app/dashboard/useEstimatedMileage.ts
//
// Pre-fills the "mileage at the time" field on every manual (no-receipt)
// logging form with a date-based estimate, using the exact same pure
// maths (estimateMileage in mileageEstimate.ts) that already drives the
// "mileage interpolated/estimated" badges on scanned-receipt entries -
// just run client-side here instead of during a receipt commit, since
// there's no AI parsing step to hang it off. Nothing here is trusted
// blindly: the field stays fully editable, a plain-language note says
// it's an estimate to check, and the existing checkMileageConsistency
// cross-check still runs against whatever the person finally submits.
//
// Deliberately uses the full mileageHistory passed down to these forms
// (every logged point, regardless of AI confidence) rather than only
// "trusted" points the way the receipt-commit pipeline's own
// trustedMileagePoints/allMileagePoints split does - that distinction
// matters there because a receipt can sometimes auto-commit with no
// human ever looking at it. Every manual form here always shows an
// editable, reviewed-before-saving field, so a coarser signal is an
// acceptable trade for not having to thread mileageConfidence through
// gatherMileagePoints and every other consumer of its return type.
import { useEffect, useState } from 'react';
import { estimateMileage, type MileagePoint } from '@/lib/tracker/mileageEstimate';
import { convertMilesToDisplay, type DistanceUnit } from '@/lib/tracker/unitFormat';

interface UseEstimatedMileageArgs {
  date: string;
  mileageHistory: MileagePoint[];
  startingMileage: number;
  currentMileage: number;
  dateAdded: string;
  distanceUnit: DistanceUnit;
}

export function useEstimatedMileage({
  date,
  mileageHistory,
  startingMileage,
  currentMileage,
  dateAdded,
  distanceUnit,
}: UseEstimatedMileageArgs) {
  const [mileageDisplay, setMileageDisplay] = useState(() =>
    String(Math.round(convertMilesToDisplay(currentMileage, distanceUnit)))
  );
  const [mileageTouched, setMileageTouched] = useState(false);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);

  // Re-estimates every time the date changes, right up until the person
  // types their own mileage - at which point their own figure always
  // wins and this stops overwriting it, even if they then change the
  // date again.
  useEffect(() => {
    if (mileageTouched || !date) return;
    // Today (or a future date, however briefly the form might sit open
    // across midnight) needs no estimate at all - the current mileage IS
    // the answer, not a guess. Handled separately rather than passed
    // through estimateMileage because that function measures "today" as
    // exact-instant Date.now() against a date-only string parsed at
    // midnight - close enough for a receipt from months ago, but for a
    // same-day entry that gap alone rounds to a mileage a mile or two
    // under the real current figure, which then trips
    // checkMileageConsistency's own "can't be lower than current
    // mileage" rule before the person has even touched the field.
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date >= todayStr) {
      setMileageDisplay(String(Math.round(convertMilesToDisplay(currentMileage, distanceUnit))));
      setEstimateNote(null);
      return;
    }
    const result = estimateMileage(date, mileageHistory, { startingMileage, currentMileage, dateAdded });
    if (result.requiresManualEntry) {
      setEstimateNote(
        result.warning ?? 'Not enough logged history near this date to estimate mileage confidently - please enter it yourself.'
      );
      return; // Leave the field on its current-mileage placeholder rather than claim a confident estimate.
    }
    setMileageDisplay(String(Math.round(convertMilesToDisplay(result.mileage, distanceUnit))));
    const confidenceNote = result.confidence === 'interpolated' ? 'interpolated between logged records' : "estimated from this bike's logged pace";
    setEstimateNote(`Mileage ${confidenceNote} for this date${result.warning ? ` - ${result.warning}` : ''}. Please check and adjust if needed.`);
  }, [date, mileageHistory, startingMileage, currentMileage, dateAdded, distanceUnit, mileageTouched]);

  function onMileageChange(value: string) {
    setMileageTouched(true);
    setEstimateNote(null);
    setMileageDisplay(value);
  }

  return { mileageDisplay, onMileageChange, estimateNote };
}
