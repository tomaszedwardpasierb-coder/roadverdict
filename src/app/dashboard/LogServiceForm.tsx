// Place at: src/app/dashboard/LogServiceForm.tsx
'use client';

import { useState } from 'react';
import { JOB_GROUPS, JOB_LABELS } from '@/lib/tracker/jobTypes';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

export function LogServiceForm({ initialMileage }: { initialMileage: number }) {
  const [jobType, setJobType] = useState('basic-service');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState(String(initialMileage));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/services');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({
      jobType,
      cost: Number(cost),
      mileage: Number(mileage),
      date,
      notes,
    });
    if (ok) {
      setCost('');
      setNotes('');
    }
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a service</span>
        <div className="field">
          <label htmlFor="job-date">Date</label>
          <input id="job-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="job-type">Job</label>
          <select id="job-type" value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {JOB_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{JOB_LABELS[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="job-cost">Cost paid (£)</label>
          <input id="job-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="job-mileage">Mileage at the time</label>
          <input id="job-mileage" type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="job-notes">Notes (optional)</label>
          <textarea id="job-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. front only, done at Halfords Autocentre" />
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
