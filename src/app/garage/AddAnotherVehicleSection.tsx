// Place at: src/app/garage/AddAnotherVehicleSection.tsx
//
// Replaces AddAnotherBikeSection.tsx now that a garage can hold both
// bikes and cars: clicking "+ Add another vehicle" asks which kind
// first, then renders the matching existing form (AddBikeForm/
// AddCarForm) - neither of those forms changes at all, this just adds
// the kind-picker step in front of them.
'use client';

import { useState, type ReactNode } from 'react';
import { AddBikeForm } from '@/app/dashboard/AddBikeForm';
import { AddCarForm } from '@/app/dashboard/AddCarForm';
import styles from './garage.module.css';

type Kind = 'bike' | 'car';

interface Props {
  vehicleCount: number;
  maxFreeVehicles: number;
  isPro?: boolean;
  // The account's real cap (plan plus any allowance set from /tomasz).
  // Without it a Pro account is never shown as full here - the server
  // still refuses the add either way.
  limit?: number;
  // Shown under the "garage full" notice - e.g. the button that buys
  // another vehicle (ExtraVehicles.tsx).
  fullAction?: ReactNode;
}

export function AddAnotherVehicleSection({ vehicleCount, maxFreeVehicles, isPro = false, limit, fullAction }: Props) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [asking, setAsking] = useState(false);
  const raised = limit !== undefined && limit > maxFreeVehicles;
  const atCap = limit !== undefined ? vehicleCount >= limit : !isPro && vehicleCount >= maxFreeVehicles;

  if (atCap && (isPro || raised)) {
    return (
      <div className={styles.capNotice}>
        Your account can track {limit} vehicles at a time - bikes and cars together. Vehicles you&apos;ve transferred to a new owner don&apos;t count.
        {fullAction}
      </div>
    );
  }

  if (atCap) {
    return (
      <div className={styles.capNotice}>
        Free accounts can track {maxFreeVehicles} vehicle{maxFreeVehicles === 1 ? "" : "s"}. Upgrade to Pro to add
        another (bike or car) - and compare them side by side to see which one actually costs you more to run.
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
