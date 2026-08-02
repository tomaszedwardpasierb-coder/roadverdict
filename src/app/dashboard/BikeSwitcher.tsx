// Place at: src/app/dashboard/BikeSwitcher.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import styles from './dashboard.module.css';

export interface SwitcherBike {
  id: string;
  name: string;
  year: number;
  currentMileage: number;
}

interface Props {
  bikes: SwitcherBike[];
  activeBikeId: string;
  distanceUnit: DistanceUnit;
}

export function BikeSwitcher({ bikes, activeBikeId, distanceUnit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const active = bikes.find((b) => b.id === activeBikeId) ?? bikes[0];

  async function switchTo(bikeId: string) {
    if (bikeId === activeBikeId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const res = await fetch('/api/tracker/active-bike', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeId }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setSwitching(false);
    }
  }

  if (!active) return null;

  // The common case today: exactly one bike. No dropdown chrome at all -
  // this is deliberately identical to how the sidebar looked before the
  // switcher existed.
  if (bikes.length <= 1) {
    return (
      <div className={styles.sidebarBikeCard}>
        <div className={styles.sidebarBikeLabel}>My bike</div>
        <div className={styles.sidebarBikeName}>{active.name}</div>
        <div className={styles.sidebarBikeMeta}>
          {active.year} · {formatDistance(active.currentMileage, distanceUnit)}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.sidebarBikeCard}>
      <button
        type="button"
        className={styles.bikeSwitcherTrigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <div className={styles.sidebarBikeLabel}>My bike</div>
        <div className={styles.sidebarBikeName}>
          {active.name} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </div>
        <div className={styles.sidebarBikeMeta}>
          {active.year} · {formatDistance(active.currentMileage, distanceUnit)}
        </div>
      </button>

      {open && (
        <div className={styles.bikeSwitcherDropdown}>
          {bikes.map((b) => (
            <button
              key={b.id}
              type="button"
              disabled={switching}
              className={`${styles.bikeSwitcherRow} ${b.id === activeBikeId ? styles.bikeSwitcherRowActive : ''}`}
              onClick={() => switchTo(b.id)}
            >
              {b.name} <span className={styles.bikeSwitcherRowMeta}>({b.year})</span>
            </button>
          ))}
          <Link href="/garage" className={styles.bikeSwitcherManageLink} onClick={() => setOpen(false)}>
            Manage bikes →
          </Link>
        </div>
      )}
    </div>
  );
}
