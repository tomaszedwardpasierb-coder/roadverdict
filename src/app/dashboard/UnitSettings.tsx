// Place at: src/app/dashboard/UnitSettings.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import type { DistanceUnit, FuelEconomyUnit } from '@/lib/tracker/unitFormat';
import styles from './dashboard.module.css';

interface Props {
  distanceUnit: DistanceUnit;
  fuelEconomyUnit: FuelEconomyUnit;
}

export function UnitSettings({ distanceUnit, fuelEconomyUnit }: Props) {
  const [editing, setEditing] = useState(false);
  const [dUnit, setDUnit] = useState(distanceUnit);
  const [fUnit, setFUnit] = useState(fuelEconomyUnit);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ distanceUnit: dUnit, fuelEconomyUnit: fUnit }, 'PATCH');
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" className={styles.iconBtn} onClick={() => setEditing(true)}>
        Units: {distanceUnit === 'km' ? 'Kilometres' : 'Miles'} / {fuelEconomyUnit === 'l100km' ? 'L/100km' : 'MPG'}
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="distance-unit">Distance</label>
        <select id="distance-unit" value={dUnit} onChange={(e) => setDUnit(e.target.value as DistanceUnit)}>
          <option value="mi">Miles</option>
          <option value="km">Kilometres</option>
        </select>
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="fuel-unit">Fuel economy</label>
        <select id="fuel-unit" value={fUnit} onChange={(e) => setFUnit(e.target.value as FuelEconomyUnit)}>
          <option value="mpg">MPG</option>
          <option value="l100km">L/100km</option>
        </select>
      </div>
      <button className="submit-button" type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className={styles.iconBtn} onClick={() => setEditing(false)} disabled={submitting}>
        Cancel
      </button>
      {error && <span className="error-text">{error}</span>}
    </form>
  );
}
