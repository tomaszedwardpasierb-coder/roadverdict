// Place at: src/app/dashboard/CarServiceHistoryCard.tsx
//
// Deliberately simpler than ServiceHistoryCard.tsx: no price-benchmark
// verdict (no car pricing data exists yet - Phase 7, out of scope for
// this pass rather than guessed), no mileage-conflict-modal (edits rely
// on the server's own checkMileageConsistency, already wired into
// car-services/[id]/route.ts - a conflict simply surfaces as the
// server's own error message on save, same as a first-time log would
// show via MileageWarning). View/edit toggle + delete, same as every
// other tracker card in spirit.
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { CAR_JOB_LABELS } from '@/lib/tracker/carJobTypes';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { CarServiceRecordDoc } from '@/lib/tracker/carServiceRecord';
import styles from './dashboard.module.css';

interface Props {
  record: CarServiceRecordDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}

export function CarServiceHistoryCard({ record, distanceUnit, currency, rates }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [jobType, setJobType] = useState(record.jobType);
  const [cost, setCost] = useState(String(record.cost));
  const [mileage, setMileage] = useState(String(record.mileage));
  const [date, setDate] = useState(record.date.slice(0, 10));
  const [notes, setNotes] = useState(record.notes ?? '');
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/cars/car-services/${record.id}`);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ jobType, cost: Number(cost), mileage: Number(mileage), date, notes }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this service record?')) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className={styles.card} onSubmit={handleSave} style={{ marginTop: '0.6rem' }}>
        <div className="field">
          <label htmlFor={`carsvc-edit-job-${record.id}`}>Job</label>
          <select id={`carsvc-edit-job-${record.id}`} value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {Object.entries(CAR_JOB_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-date-${record.id}`}>Date</label>
          <input id={`carsvc-edit-date-${record.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-cost-${record.id}`}>Cost paid</label>
          <input id={`carsvc-edit-cost-${record.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-mileage-${record.id}`}>Mileage</label>
          <input id={`carsvc-edit-mileage-${record.id}`} type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-notes-${record.id}`}>Notes</label>
          <textarea id={`carsvc-edit-notes-${record.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
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
      {record.needsReview && <p className="field-note" style={{ marginBottom: '0.4rem' }}>🧠 Scanned from a receipt - please check this over.</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <strong>{CAR_JOB_LABELS[record.jobType] ?? record.jobType}</strong>
        <span>{formatCurrency(record.cost, currency, rates)}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
        {new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {formatDistance(record.mileage, distanceUnit)}
      </div>
      {record.notes && <p style={{ marginTop: '0.4rem' }}>{record.notes}</p>}
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
