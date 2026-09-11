// Place at: src/app/dashboard/CarModCard.tsx
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { CAR_MOD_LABELS } from '@/lib/tracker/carModTypes';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { CarModDoc } from '@/lib/tracker/carMod';
import styles from './dashboard.module.css';

interface Props {
  mod: CarModDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}

export function CarModCard({ mod, distanceUnit, currency, rates }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [category, setCategory] = useState(mod.category);
  const [name, setName] = useState(mod.name);
  const [cost, setCost] = useState(String(mod.cost));
  const [mileage, setMileage] = useState(String(mod.mileage));
  const [date, setDate] = useState(mod.date.slice(0, 10));
  const [notes, setNotes] = useState(mod.notes ?? '');
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/cars/car-mods/${mod.id}`);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ category, name, cost: Number(cost), mileage: Number(mileage), date, notes }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this entry?')) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className={styles.card} onSubmit={handleSave} style={{ marginTop: '0.6rem' }}>
        <div className="field">
          <label htmlFor={`carmod-edit-category-${mod.id}`}>Category</label>
          <select id={`carmod-edit-category-${mod.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CAR_MOD_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carmod-edit-name-${mod.id}`}>What is it?</label>
          <input id={`carmod-edit-name-${mod.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carmod-edit-date-${mod.id}`}>Date</label>
          <input id={`carmod-edit-date-${mod.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carmod-edit-cost-${mod.id}`}>Cost paid</label>
          <input id={`carmod-edit-cost-${mod.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carmod-edit-mileage-${mod.id}`}>Mileage</label>
          <input id={`carmod-edit-mileage-${mod.id}`} type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carmod-edit-notes-${mod.id}`}>Notes</label>
          <textarea id={`carmod-edit-notes-${mod.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <VehicleSpinner kind="car" size={14} />}
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
      {mod.needsReview && <p className="field-note" style={{ marginBottom: '0.4rem' }}>🧠 Scanned from a receipt - please check this over.</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <strong>{mod.name}</strong>
        <span>{formatCurrency(mod.cost, currency, rates)}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
        {CAR_MOD_LABELS[mod.category] ?? mod.category} · {new Date(mod.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {formatDistance(mod.mileage, distanceUnit)}
      </div>
      {mod.notes && <p style={{ marginTop: '0.4rem' }}>{mod.notes}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting && <VehicleSpinner kind="car" size={14} />}
          Delete
        </button>
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
