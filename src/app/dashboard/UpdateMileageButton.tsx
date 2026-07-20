// Place at: src/app/dashboard/UpdateMileageButton.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

export function UpdateMileageButton({ currentMileage }: { currentMileage: number }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentMileage));
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ currentMileage: Number(value) }, 'PATCH');
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
        <button className={styles.iconBtn} type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button className={styles.iconBtn} type="button" onClick={() => setEditing(false)} disabled={submitting}>
          Cancel
        </button>
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
