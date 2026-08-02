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

  return (
    <div className={styles.card}>
      {isActive && <div className={styles.activeBadge}>Currently viewing</div>}
      <div className={styles.cardName}>{name}</div>
      <div className={styles.cardMeta}>
        {year} · {currentMileage.toLocaleString()} miles
      </div>
      <button type="button" className="submit-button" onClick={handleViewDashboard} disabled={loading}>
        {loading ? 'Switching…' : 'View dashboard'}
      </button>
    </div>
  );
}
