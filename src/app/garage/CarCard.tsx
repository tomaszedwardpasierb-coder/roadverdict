// Place at: src/app/garage/CarCard.tsx
//
// Car equivalent of BikeCard.tsx - deliberately simpler: no registration-
// change form and no "request prior history" flow, since neither has a
// car-side route yet (car ownership transfer is a separate, larger gap -
// see the ADR). View dashboard + delete only.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './garage.module.css';

interface Props {
  carId: string;
  name: string;
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  isActive: boolean;
  currentRegistration?: string;
  transferredToEmail?: string;
}

export function CarCard({ carId, name, year, isCustomBuild, currentMileage, isActive, currentRegistration, transferredToEmail }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleViewDashboard() {
    if (isActive) {
      router.push('/dashboard');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/cars/active-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carId }),
      });
      if (res.ok) {
        router.push('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (
      !confirm(
        `Delete "${name}"? This permanently deletes this car AND every service, fuel, mods, bills, and reminder entry logged against it. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/cars/car/${encodeURIComponent(carId)}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}));
      setDeleteError(data.error ?? 'Could not delete this car. Try again.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.card}>
      {isActive && <div className={styles.activeBadge}>Currently viewing</div>}
      {transferredToEmail && (
        <div className={styles.readOnlyBadge}>Read-only - transferred to {transferredToEmail}</div>
      )}
      <div className={styles.cardName}>{name}</div>
      <div className={styles.cardMeta}>
        {isCustomBuild ? 'Custom build' : year} · {currentMileage.toLocaleString()} miles
      </div>
      {currentRegistration && <div className={styles.cardRegistration}>{currentRegistration}</div>}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="submit-button" onClick={handleViewDashboard} disabled={loading || deleting}>
          {loading ? 'Switching…' : 'View dashboard'}
        </button>
        {!transferredToEmail && (
          <button type="button" className={styles.deleteBtn} onClick={handleDelete} disabled={loading || deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        )}
      </div>
      {deleteError && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{deleteError}</p>}
    </div>
  );
}
