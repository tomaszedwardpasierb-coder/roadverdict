// Place at: src/app/dashboard/LogBillForm.tsx
'use client';

import { useState } from 'react';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

export function LogBillForm() {
  const [billType, setBillType] = useState('insurance');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bills');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ billType, cost: Number(cost), date, notes });
    if (ok) {
      setCost('');
      setNotes('');
    }
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log insurance, tax, or an MOT</span>
        <div className="field">
          <label htmlFor="bill-date">Date</label>
          <input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bill-type">Type</label>
          <select id="bill-type" value={billType} onChange={(e) => setBillType(e.target.value)}>
            {Object.entries(BILL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bill-cost">Cost (£)</label>
          <input id="bill-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bill-notes">Notes (optional)</label>
          <textarea id="bill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fully comprehensive, Bennetts" />
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
