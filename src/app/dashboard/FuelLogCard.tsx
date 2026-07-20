// Place at: src/app/dashboard/FuelLogCard.tsx
'use client';

import { useState } from 'react';
import type { FuelLogDoc } from '@/lib/tracker/fuelLog';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

function fmtMoney(n: number): string {
  return `£${n.toFixed(0)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FuelLogCard({ log }: { log: FuelLogDoc }) {
  const [isEditing, setIsEditing] = useState(false);
  const [litres, setLitres] = useState(String(log.litres));
  const [cost, setCost] = useState(String(log.cost));
  const [mileage, setMileage] = useState(String(log.mileage));
  const [date, setDate] = useState(log.date);
  const [filledToFull, setFilledToFull] = useState(log.filledToFull);
  const { submit, submitting, error } = useTrackerFormSubmit(
    `/api/tracker/fuel/${encodeURIComponent(log.id)}`
  );

  const perLitre = (log.cost / log.litres).toFixed(2);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit(
      { litres: Number(litres), cost: Number(cost), mileage: Number(mileage), date, filledToFull },
      'PATCH'
    );
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this fuel entry? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-fuel-date-${log.id}`}>Date</label>
            <input id={`edit-fuel-date-${log.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-fuel-litres-${log.id}`}>Litres</label>
            <input id={`edit-fuel-litres-${log.id}`} type="number" min="0" step="0.01" value={litres} onChange={(e) => setLitres(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-fuel-cost-${log.id}`}>Cost paid (£)</label>
            <input id={`edit-fuel-cost-${log.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-fuel-mileage-${log.id}`}>Mileage</label>
            <input id={`edit-fuel-mileage-${log.id}`} type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
          </div>
          <div className="field-checkbox">
            <label>
              <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} />
              Filled the tank completely full
            </label>
          </div>
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(false)} disabled={submitting}>
            Cancel
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>
    );
  }

  return (
    <div className={styles.jobCard}>
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{log.litres.toFixed(1)} L{log.filledToFull ? ' (full tank)' : ''}</span>
        <span className={styles.jobCardCost}>{fmtMoney(log.cost)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(log.date)} · {log.mileage.toLocaleString()} miles · {perLitre}p/litre
      </div>
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
