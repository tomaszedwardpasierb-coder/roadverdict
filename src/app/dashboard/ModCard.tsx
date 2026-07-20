// Place at: src/app/dashboard/ModCard.tsx
'use client';

import { useState } from 'react';
import { MOD_GROUPS, MOD_LABELS } from '@/lib/tracker/modTypes';
import type { ModDoc } from '@/lib/tracker/mod';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

function fmtMoney(n: number): string {
  return `£${n.toFixed(0)}`;
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ModCard({ mod }: { mod: ModDoc }) {
  const [isEditing, setIsEditing] = useState(false);
  const [category, setCategory] = useState(mod.category);
  const [name, setName] = useState(mod.name);
  const [cost, setCost] = useState(String(mod.cost));
  const [mileage, setMileage] = useState(String(mod.mileage));
  const [date, setDate] = useState(mod.date);
  const [notes, setNotes] = useState(mod.notes);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/mods/${encodeURIComponent(mod.id)}`);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ category, name, cost: Number(cost), mileage: Number(mileage), date, notes }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this modification? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-mod-date-${mod.id}`}>Date</label>
            <input id={`edit-mod-date-${mod.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-category-${mod.id}`}>Category</label>
            <select id={`edit-mod-category-${mod.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {MOD_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.mods.map((m) => (
                    <option key={m} value={m}>{MOD_LABELS[m]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-name-${mod.id}`}>What is it?</label>
            <input id={`edit-mod-name-${mod.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-cost-${mod.id}`}>Cost (£)</label>
            <input id={`edit-mod-cost-${mod.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-mileage-${mod.id}`}>Mileage</label>
            <input id={`edit-mod-mileage-${mod.id}`} type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-notes-${mod.id}`}>Notes</label>
            <textarea id={`edit-mod-notes-${mod.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
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
        <span className={styles.jobCardJob}>{mod.name}</span>
        <span className={styles.jobCardCost}>{fmtMoney(mod.cost)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {MOD_LABELS[mod.category]} · {fmtDate(mod.date)} · {mod.mileage.toLocaleString()} miles
      </div>
      {mod.notes && <div className={styles.jobCardNotes}>{mod.notes}</div>}
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
