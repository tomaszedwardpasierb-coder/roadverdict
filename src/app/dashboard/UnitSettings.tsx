// Place at: src/app/dashboard/UnitSettings.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import type { DistanceUnit, FuelEconomyUnit } from '@/lib/tracker/unitFormat';
import { ALL_CURRENCIES, CURRENCY_LABELS, type Currency } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

interface Props {
  distanceUnit: DistanceUnit;
  fuelEconomyUnit: FuelEconomyUnit;
  currency: Currency;
}

export function UnitSettings({ distanceUnit, fuelEconomyUnit, currency }: Props) {
  const [editing, setEditing] = useState(false);
  const [dUnit, setDUnit] = useState(distanceUnit);
  const [fUnit, setFUnit] = useState(fuelEconomyUnit);
  const [curr, setCurr] = useState(currency);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ distanceUnit: dUnit, fuelEconomyUnit: fUnit, currency: curr }, 'PATCH');
    if (ok) setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" className={styles.iconBtn} onClick={() => setEditing(true)}>
        Units: {distanceUnit === 'km' ? 'Kilometres' : 'Miles'} / {fuelEconomyUnit === 'l100km' ? 'L/100km' : 'MPG'} / {currency}
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
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="currency-unit">Currency</label>
        <select id="currency-unit" value={curr} onChange={(e) => setCurr(e.target.value as Currency)}>
          {ALL_CURRENCIES.map((c) => (
            <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
          ))}
        </select>
      </div>
      <button className="submit-button" type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => {
          setDUnit(distanceUnit);
          setFUnit(fuelEconomyUnit);
          setCurr(currency);
          setEditing(false);
        }}
        disabled={submitting}
      >
        Cancel
      </button>
      {error && <span className="error-text">{error}</span>}
      {curr !== currency && (
        <p className="field-note" style={{ width: '100%', borderColor: 'var(--verdict-red)', color: '#7a251b' }}>
          ⚠️ Changing currency doesn&apos;t touch anything you&apos;ve already logged - every amount stays stored
          exactly as recorded, and is only converted for display at today&apos;s rate. But since exchange rates
          move over time, switching back and forth repeatedly means your historical totals will be converted at a
          slightly different rate each time you look, which can make month-to-month comparisons feel inconsistent.
          Best treated as a one-time, permanent choice rather than something to toggle casually.
        </p>
      )}
    </form>
  );
}
