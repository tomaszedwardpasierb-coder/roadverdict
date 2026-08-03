// Place at: src/app/garage/BikeCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './garage.module.css';

interface Props {
  bikeId: string;
  name: string;
  year: number;
  currentMileage: number;
  isActive: boolean;
}

export function BikeCard({ bikeId, name, year, currentMileage, isActive }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleViewDashboard() {
    if (isActive) {
      router.push('/dashboard');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/tracker/active-bike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeId }),
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
        `Delete "${name}"? This permanently deletes this bike AND every service, fuel, mods, bills, and reminder entry logged against it. This cannot be undone.`
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/tracker/bike/${encodeURIComponent(bikeId)}`, { method: 'DELETE' });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={styles.card}>
      {isActive && <div className={styles.activeBadge}>Currently viewing</div>}
      <div className={styles.cardName}>{name}</div>
      <div className={styles.cardMeta}>
        {year} · {currentMileage.toLocaleString()} miles
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <button type="button" className="submit-button" onClick={handleViewDashboard} disabled={loading || deleting}>
          {loading ? 'Switching…' : 'View dashboard'}
        </button>
        <button type="button" className={styles.deleteBtn} onClick={handleDelete} disabled={loading || deleting}>
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  );
}
