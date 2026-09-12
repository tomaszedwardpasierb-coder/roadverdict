// Place at: src/app/dashboard/CarFuelLogCard.tsx
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { CarFuelLogDoc } from '@/lib/tracker/carFuelLog';
import styles from './dashboard.module.css';

interface Props {
  log: CarFuelLogDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}

export function CarFuelLogCard({ log, distanceUnit, currency, rates }: Props) {
  const isElectric = log.fuelType === 'electric';
  const [isEditing, setIsEditing] = useState(false);
  const [amount, setAmount] = useState(String(isElectric ? (log.kwh ?? '') : (log.litres ?? '')));
  const [cost, setCost] = useState(String(log.cost));
  const [mileage, setMileage] = useState(String(log.mileage));
  const [date, setDate] = useState(log.date.slice(0, 10));
  const [filledToFull, setFilledToFull] = useState(Boolean(log.filledToFull));
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/cars/car-fuel/${log.id}`);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({
      litres: isElectric ? undefined : Number(amount),
      kwh: isElectric ? Number(amount) : undefined,
      cost: Number(cost),
      mileage: Number(mileage),
      date,
      filledToFull: isElectric ? undefined : filledToFull,
    }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this fuel log?')) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className={styles.card} onSubmit={handleSave} style={{ marginTop: '0.6rem' }}>
        <div className="field">
          <label htmlFor={`carfuel-edit-amount-${log.id}`}>{isElectric ? 'Energy added (kWh)' : 'Litres added'}</label>
          <input id={`carfuel-edit-amount-${log.id}`} type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carfuel-edit-date-${log.id}`}>Date</label>
          <input id={`carfuel-edit-date-${log.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carfuel-edit-cost-${log.id}`}>Cost paid</label>
          <input id={`carfuel-edit-cost-${log.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carfuel-edit-mileage-${log.id}`}>Mileage</label>
          <input id={`carfuel-edit-mileage-${log.id}`} type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        {!isElectric && (
          <div className="field-checkbox" style={{ marginTop: '0.6rem' }}>
            <label>
              <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} />
              Filled the tank completely full
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <VehicleSpinner kind="car" size={20} />}
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(false)} disabled={submitting}>Cancel</button>
        </div>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
      </form>
    );
  }

  return (
    <div className={styles.card} style={{ marginTop: '0.6rem' }}>
      {log.needsReview && <p className="field-note" style={{ marginBottom: '0.4rem' }}>🧠 Scanned from a receipt - please check this over.</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <strong>{isElectric ? `${(log.kwh ?? 0).toFixed(1)} kWh` : `${(log.litres ?? 0).toFixed(1)}L`}{!isElectric && log.filledToFull ? ' (full tank)' : ''}</strong>
        <span>{formatCurrency(log.cost, currency, rates)}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
        {new Date(log.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {formatDistance(log.mileage, distanceUnit)}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting && <VehicleSpinner kind="car" size={20} />}
          Delete
        </button>
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
