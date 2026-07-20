// Place at: src/app/dashboard/LogBillForm.tsx
'use client';

import { useState } from 'react';
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from '@/lib/tracker/billTypes';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

type RemindType = 'mileage' | 'months' | 'date';

export function LogBillForm() {
  const [billType, setBillType] = useState('insurance');
  const [cost, setCost] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [remindChecked, setRemindChecked] = useState(true);
  const [remindType, setRemindType] = useState<RemindType>('months');
  const [remindValue, setRemindValue] = useState('12');
  const [remindDate, setRemindDate] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bills');

  function handleBillTypeChange(newType: string) {
    setBillType(newType);
    if (remindChecked) {
      const def = BILL_REMINDER_DEFAULTS[newType];
      setRemindType(def ? def.type : 'months');
      setRemindValue(def ? String(def.value) : '12');
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body: {
      billType: string;
      cost: number;
      date: string;
      notes: string;
      reminder?: { intervalType: RemindType; intervalValue?: number; exactDate?: string };
    } = { billType, cost: Number(cost), date, notes };

    if (remindChecked) {
      body.reminder =
        remindType === 'date'
          ? { intervalType: 'date', exactDate: remindDate }
          : { intervalType: remindType, intervalValue: Number(remindValue) };
    }

    const ok = await submit(body);
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
          <select id="bill-type" value={billType} onChange={(e) => handleBillTypeChange(e.target.value)}>
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

        <div className="field-checkbox">
          <label>
            <input type="checkbox" checked={remindChecked} onChange={(e) => setRemindChecked(e.target.checked)} />
            🔔 Remind me when this is due for renewal
          </label>
        </div>

        {remindChecked && (
          <div style={{ marginTop: '0.6rem', paddingLeft: '1.4rem', borderLeft: '2px solid var(--amber)' }}>
            <div className="field">
              <label htmlFor="bill-remind-type">Track by</label>
              <select id="bill-remind-type" value={remindType} onChange={(e) => setRemindType(e.target.value as RemindType)}>
                <option value="months">Time (months)</option>
                <option value="mileage">Mileage</option>
                <option value="date">Exact date</option>
              </select>
            </div>
            {remindType === 'date' ? (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="bill-remind-date">Date</label>
                <input id="bill-remind-date" type="date" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} required />
              </div>
            ) : (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="bill-remind-value">Interval</label>
                <input id="bill-remind-value" type="number" min="1" value={remindValue} onChange={(e) => setRemindValue(e.target.value)} required />
              </div>
            )}
          </div>
        )}
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
