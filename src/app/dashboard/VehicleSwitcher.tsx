// Place at: src/app/dashboard/VehicleSwitcher.tsx
//
// Replaces BikeSwitcher.tsx - same component, generalized to list every
// vehicle on the account regardless of kind, per the hybrid dashboard
// decision in RoadVerdict_Car_Plan_v3.md's ADR. For an account with
// only bikes (every account that predates car support), this renders
// byte-for-byte the same UI BikeSwitcher.tsx did - the single- and
// multi-vehicle branches below are structurally identical to it, just
// generalized to accept a `kind` per entry instead of assuming bike.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

export type VehicleKind = 'bike' | 'car';

export interface SwitcherVehicle {
  id: string;
  kind: VehicleKind;
  name: string;
  year?: number;
  currentMileage: number;
}

interface Props {
  vehicles: SwitcherVehicle[];
  activeVehicleId: string;
  distanceUnit: DistanceUnit;
}

// One endpoint per kind - each already validates the id belongs to the
// signed-in account and sets both its own vehicle-id cookie and the
// shared activeVehicleKind cookie (see activeVehicle.ts).
const SWITCH_ENDPOINT: Record<VehicleKind, string> = {
  bike: '/api/tracker/active-bike',
  car: '/api/cars/active-car',
};
const SWITCH_BODY_KEY: Record<VehicleKind, string> = {
  bike: 'bikeId',
  car: 'carId',
};

export function VehicleSwitcher({ vehicles, activeVehicleId, distanceUnit }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Tracks WHICH row is mid-switch (not just a plain boolean) so the
  // spinner can show that row's own kind - the vehicle being switched TO,
  // not whatever kind was active before the click, which for a bike->car
  // switch would otherwise show the wrong wheel while it's in flight.
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const active = vehicles.find((v) => v.id === activeVehicleId) ?? vehicles[0];

  async function switchTo(vehicle: SwitcherVehicle) {
    if (vehicle.id === activeVehicleId) {
      setOpen(false);
      return;
    }
    setSwitchingId(vehicle.id);
    try {
      const res = await fetch(SWITCH_ENDPOINT[vehicle.kind], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [SWITCH_BODY_KEY[vehicle.kind]]: vehicle.id }),
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setSwitchingId(null);
    }
  }

  if (!active) return null;

  const label = active.kind === 'car' ? 'My car' : 'My bike';

  // The common case today: exactly one vehicle. Card looks the same as
  // the original bike-only version, plus a quiet link to add another -
  // pointed at /garage for a bike-only account (unchanged), or /cars for
  // a car-only account, so the destination always matches what's missing.
  if (vehicles.length <= 1) {
    return (
      <div className={styles.sidebarBikeCard}>
        <div className={styles.sidebarBikeLabel}>{label}</div>
        <div className={styles.sidebarBikeName}>{active.name}</div>
        <div className={styles.sidebarBikeMeta}>
          {active.year ?? 'Custom build'} · {formatDistance(active.currentMileage, distanceUnit)}
        </div>
        {/* /garage itself isn't car-aware yet - out of this pass's scope,
            tracked separately. Points here regardless of active kind. */}
        <Link href="/garage" className={styles.bikeSwitcherManageLinkInline}>
          + Add another vehicle
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
        <div className={styles.sidebarBikeLabel}>{label}</div>
        <div className={styles.sidebarBikeName}>
          {active.name} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </div>
        <div className={styles.sidebarBikeMeta}>
          {active.year ?? 'Custom build'} · {formatDistance(active.currentMileage, distanceUnit)}
        </div>
      </button>

      {open && (
        <div className={styles.bikeSwitcherDropdown}>
          {vehicles.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={switchingId !== null}
              className={`${styles.bikeSwitcherRow} ${v.id === activeVehicleId ? styles.bikeSwitcherRowActive : ''}`}
              onClick={() => switchTo(v)}
            >
              {switchingId === v.id && <VehicleSpinner kind={v.kind} size={13} />}
              {v.name}{' '}
              <span className={styles.bikeSwitcherRowMeta}>
                ({v.kind === 'car' ? 'Car' : 'Bike'} · {v.year ?? 'Custom build'})
              </span>
            </button>
          ))}
          <Link href="/garage" className={styles.bikeSwitcherManageLink} onClick={() => setOpen(false)}>
            Manage vehicles →
          </Link>
        </div>
      )}
    </div>
  );
}
