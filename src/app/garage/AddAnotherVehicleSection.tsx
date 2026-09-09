// Place at: src/app/garage/AddAnotherVehicleSection.tsx
//
// Replaces AddAnotherBikeSection.tsx now that a garage can hold both
// bikes and cars: clicking "+ Add another vehicle" asks which kind
// first, then renders the matching existing form (AddBikeForm/
// AddCarForm) - neither of those forms changes at all, this just adds
// the kind-picker step in front of them.
'use client';

import { useState } from 'react';
import { AddBikeForm } from '@/app/dashboard/AddBikeForm';
import { AddCarForm } from '@/app/dashboard/AddCarForm';
import styles from './garage.module.css';

type Kind = 'bike' | 'car';

interface Props {
  vehicleCount: number;
  maxFreeVehicles: number;
  isPro?: boolean;
}

export function AddAnotherVehicleSection({ vehicleCount, maxFreeVehicles, isPro = false }: Props) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [asking, setAsking] = useState(false);
  const atCap = !isPro && vehicleCount >= maxFreeVehicles;

  if (atCap) {
    return (
      <div className={styles.capNotice}>
        Free accounts can track up to {maxFreeVehicles} vehicles total (bikes and cars combined). Upgrade to add more.
      </div>
    );
  }

  if (kind === 'bike') {
    return (
      <div className={styles.addFormWrapper}>
        <AddBikeForm />
      </div>
    );
  }

  if (kind === 'car') {
    return (
      <div className={styles.addFormWrapper}>
        <AddCarForm />
      </div>
    );
  }

  if (asking) {
    return (
      <div className={styles.addFormWrapper}>
        <p className="field-note" style={{ marginBottom: '0.6rem' }}>Is it a car or a motorcycle?</p>
        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button type="button" className="submit-button" onClick={() => setKind('bike')}>
            Motorcycle
          </button>
          <button type="button" className="submit-button" onClick={() => setKind('car')}>
            Car
          </button>
        </div>
      </div>
    );
  }

  return (
    <button type="button" className="submit-button" onClick={() => setAsking(true)}>
      + Add another vehicle
    </button>
  );
}
