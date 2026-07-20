// Place at: src/app/dashboard/LogFuelForm.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

export function LogFuelForm({ initialMileage }: { initialMileage: number }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [litres, setLitres] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState(String(initialMileage));
  const [filledToFull, setFilledToFull] = useState(true);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/fuel');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({
      litres: Number(litres),
      cost: Number(cost),
      mileage: Number(mileage),
      date,
      filledToFull,
    });
    if (ok) {
      setLitres('');
      setCost('');
    }
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a fuel fill-up</span>
        <div className="field">
          <label htmlFor="fuel-date">Date</label>
          <input id="fuel-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="fuel-litres">Litres added</label>
          <input id="fuel-litres" type="number" min="0" step="0.01" value={litres} onChange={(e) => setLitres(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="fuel-cost">Cost paid (£)</label>
          <input id="fuel-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="fuel-mileage">Mileage at the time</label>
          <input id="fuel-mileage" type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field-checkbox">
          <label>
            <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} />
            Filled the tank completely full
          </label>
        </div>
        <div className="field-note">
          Tick this whenever true - it&apos;s what lets us calculate your bike&apos;s real MPG from consecutive fill-ups, rather than a general assumption.
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
