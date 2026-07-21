// Place at: src/app/dashboard/UpdateMileageButton.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

export function UpdateMileageButton({ currentMileage }: { currentMileage: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentMileage));
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  const valueNum = Number(value);
  const isBlocked = valueNum > 0 && valueNum < currentMileage;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const ok = await submit({ currentMileage: valueNum }, 'PATCH');
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
        <button className={styles.iconBtn} type="submit" disabled={submitting || isBlocked}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button className={styles.iconBtn} type="button" onClick={() => setEditing(false)} disabled={submitting}>
          Cancel
        </button>
        {isBlocked && (
          <p className="field-note" style={{ borderColor: 'var(--verdict-red)', color: '#7a251b', width: '100%' }}>
            ⛔ This can&apos;t be lower than your bike&apos;s current recorded mileage ({currentMileage.toLocaleString()}) - there&apos;s no backdating case for &quot;right now.&quot;
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
