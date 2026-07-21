// Place at: src/app/dashboard/MileageWarning.tsx
'use client';

import type { MileageCheckResult } from '@/lib/tracker/mileageCheck';
import { formatDistance, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';

interface Props {
  result: MileageCheckResult;
  distanceUnit: DistanceUnit;
  acknowledged: boolean;
  onAcknowledgeChange: (val: boolean) => void;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MileageWarning({ result, distanceUnit, acknowledged, onAcknowledgeChange }: Props) {
  if (result.status === 'ok') return null;

  let message = '';
  if (result.reason === 'today-lower') {
    message = `This is dated today or later, so it can't be lower than your bike's current recorded ${distanceUnitLabel(
      distanceUnit
    )} (${formatDistance(result.referenceMileage!, distanceUnit)}).`;
  } else if (result.reason === 'below-earlier') {
    message = `This is lower than an earlier entry on ${fmtDate(result.referenceDate!)} (${formatDistance(
      result.referenceMileage!,
      distanceUnit
    )}). If this is correct, confirm below.`;
  } else if (result.reason === 'above-later') {
    message = `This is higher than a later entry on ${fmtDate(result.referenceDate!)} (${formatDistance(
      result.referenceMileage!,
      distanceUnit
    )}). If this is correct, confirm below.`;
  }

  if (result.status === 'blocked') {
    return (
      <div className="field-note" style={{ borderColor: 'var(--verdict-red)', color: '#7a251b', marginTop: '0.9rem' }}>
        ⛔ {message}
      </div>
    );
  }

  return (
    <div className="field-note" style={{ borderColor: 'var(--verdict-red)', color: '#7a251b', marginTop: '0.9rem' }}>
      ⚠️ {message}
      <label style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center', fontWeight: 500 }}>
        <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledgeChange(e.target.checked)} />
        Yes, this mileage is correct
      </label>
    </div>
  );
}
