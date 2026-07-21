// Place at: src/app/dashboard/MileageWarning.tsx
'use client';

import type { MileageCheckResult } from '@/lib/tracker/mileageCheck';

interface Props {
  result: MileageCheckResult;
  acknowledged: boolean;
  onAcknowledgeChange: (val: boolean) => void;
}

export function MileageWarning({ result, acknowledged, onAcknowledgeChange }: Props) {
  if (result.status === 'ok') return null;

  if (result.status === 'blocked') {
    return (
      <div className="field-note" style={{ borderColor: 'var(--verdict-red)', color: '#7a251b', marginTop: '0.9rem' }}>
        ⛔ {result.message}
      </div>
    );
  }

  return (
    <div className="field-note" style={{ borderColor: 'var(--verdict-red)', color: '#7a251b', marginTop: '0.9rem' }}>
      ⚠️ {result.message}
      <label style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem', alignItems: 'center', fontWeight: 500 }}>
        <input type="checkbox" checked={acknowledged} onChange={(e) => onAcknowledgeChange(e.target.checked)} />
        Yes, this mileage is correct
      </label>
    </div>
  );
}
