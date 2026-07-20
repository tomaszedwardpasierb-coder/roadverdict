// Place at: src/app/dashboard/LogModForm.tsx
'use client';

import { useState } from 'react';
import { MOD_GROUPS, MOD_LABELS } from '@/lib/tracker/modTypes';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

export function LogModForm({ initialMileage }: { initialMileage: number }) {
  const [category, setCategory] = useState(MOD_GROUPS[0].mods[0]);
  const [name, setName] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState(String(initialMileage));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/mods');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ category, name, cost: Number(cost), mileage: Number(mileage), date, notes });
    if (ok) {
      setName('');
      setCost('');
      setNotes('');
    }
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a modification or accessory</span>
        <div className="field">
          <label htmlFor="mod-date">Date</label>
          <input id="mod-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-category">Category</label>
          <select id="mod-category" value={category} onChange={(e) => setCategory(e.target.value)}>
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
          <label htmlFor="mod-name">What is it?</label>
          <input id="mod-name" type="text" placeholder="e.g. Akrapovic slip-on can" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-cost">Cost (£)</label>
          <input id="mod-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-mileage">Mileage at the time</label>
          <input id="mod-mileage" type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-notes">Notes (optional)</label>
          <textarea id="mod-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fitted by Bob's Motorcycles" />
        </div>
        <div className="field-note" style={{ marginTop: '0.9rem' }}>
          Worth knowing: significant modifications (exhaust, suspension, bodywork) can affect your insurance - some insurers require these to be declared. Not price-benchmarked here, since aftermarket part cost varies hugely by brand and quality.
        </div>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
