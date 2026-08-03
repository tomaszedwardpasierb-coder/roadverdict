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
  year?: number;
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

  // The common case today: exactly one bike. Sidebar card looks the same
  // as before this change, plus one small addition - a quiet link to the
  // garage page. Without this there'd be no way for a single-bike account
  // to ever discover "add another bike" exists on desktop at all.
  if (bikes.length <= 1) {
    return (
      <div className={styles.sidebarBikeCard}>
        <div className={styles.sidebarBikeLabel}>My bike</div>
        <div className={styles.sidebarBikeName}>{active.name}</div>
        <div className={styles.sidebarBikeMeta}>
          {active.year ?? 'Custom build'} · {formatDistance(active.currentMileage, distanceUnit)}
        </div>
        <Link href="/garage" className={styles.bikeSwitcherManageLinkInline}>
          + Add another bike
        </Link>
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
          {active.year ?? 'Custom build'} · {formatDistance(active.currentMileage, distanceUnit)}
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
              {b.name} <span className={styles.bikeSwitcherRowMeta}>({b.year ?? 'Custom build'})</span>
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
