// Place at: src/app/garage/AddAnotherBikeSection.tsx
'use client';

import { useState } from 'react';
import { AddBikeForm } from '@/app/dashboard/AddBikeForm';
import styles from './garage.module.css';

interface Props {
  bikeCount: number;
  maxFreeBikes: number;
}

export function AddAnotherBikeSection({ bikeCount, maxFreeBikes }: Props) {
  const [showForm, setShowForm] = useState(false);
  const atCap = bikeCount >= maxFreeBikes;

  if (atCap) {
    return (
      <div className={styles.capNotice}>
        Free accounts can track up to {maxFreeBikes} bikes. Upgrade to add more.
      </div>
    );
  }

  if (!showForm) {
    return (
      <button type="button" className="submit-button" onClick={() => setShowForm(true)}>
        + Add another bike
      </button>
    );
  }

  return (
    <div className={styles.addFormWrapper}>
      <AddBikeForm />
    </div>
  );
}
