// Place at: src/app/dashboard/UpdateMileageButton.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import styles from './dashboard.module.css';

export function UpdateMileageButton({ currentMileage, distanceUnit }: { currentMileage: number; distanceUnit: DistanceUnit }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(Math.round(convertMilesToDisplay(currentMileage, distanceUnit))));
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  const valueInMiles = convertDisplayToMiles(Number(value), distanceUnit);
  const isBlocked = valueInMiles > 0 && valueInMiles < currentMileage;
  const unitLabel = distanceUnitLabel(distanceUnit);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const ok = await submit({ currentMileage: Math.round(valueInMiles) }, 'PATCH');
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <form onSubmit={handleSubmit} className={styles.mileageEditForm}>
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={styles.mileageEditInput}
          required
        />
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-soft)' }}>{unitLabel}</span>
        <button className={styles.iconBtn} type="submit" disabled={submitting || isBlocked}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button className={styles.iconBtn} type="button" onClick={() => setEditing(false)} disabled={submitting}>
          Cancel
        </button>
        {isBlocked && (
          <p className="field-note" style={{ borderColor: 'var(--verdict-red)', color: '#7a251b', width: '100%' }}>
            ⛔ This can&apos;t be lower than your bike&apos;s current recorded {unitLabel} (
            {Math.round(convertMilesToDisplay(currentMileage, distanceUnit)).toLocaleString()}).
          </p>
        )}
        {error && <span className="error-text">{error}</span>}
      </form>
    );
  }

  return (
    <button type="button" className={styles.iconBtn} onClick={() => setEditing(true)}>
      Update mileage
    </button>
  );
}
