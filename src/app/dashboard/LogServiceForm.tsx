// Place at: src/app/dashboard/LogServiceForm.tsx
'use client';

import { useState, useMemo } from 'react';
import { JOB_GROUPS, JOB_LABELS, JOB_REMINDER_DEFAULTS } from '@/lib/tracker/jobTypes';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';

type RemindType = 'mileage' | 'months' | 'date';

export function LogServiceForm({
  initialMileage,
  mileageHistory,
  distanceUnit,
  currency,
  rates,
}: {
  initialMileage: number;
  mileageHistory: HistoryPoint[];
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  const [jobType, setJobType] = useState('basic-service');
  const [costDisplay, setCostDisplay] = useState('');
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(initialMileage, distanceUnit)))
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const [remindChecked, setRemindChecked] = useState(false);
  const [remindType, setRemindType] = useState<RemindType>('mileage');
  const [remindValue, setRemindValue] = useState('');
  const [remindDate, setRemindDate] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/services');

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);

  const mileageResult = useMemo(
    () => checkMileageConsistency(mileageInMiles, date, mileageHistory, initialMileage),
    [mileageInMiles, date, mileageHistory, initialMileage]
  );
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);

  function applyDefaults(forJobType: string) {
    const def = JOB_REMINDER_DEFAULTS[forJobType];
    setRemindType(def ? def.type : 'mileage');
    setRemindValue(def ? String(def.value) : '');
  }

  function handleRemindToggle(checked: boolean) {
    setRemindChecked(checked);
    if (checked) applyDefaults(jobType);
  }

  function handleJobChange(newJobType: string) {
    setJobType(newJobType);
    if (remindChecked) applyDefaults(newJobType);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const body: {
      jobType: string;
      cost: number;
      mileage: number;
      date: string;
      notes: string;
      reminder?: { intervalType: RemindType; intervalValue?: number; exactDate?: string };
    } = { jobType, cost: costInGbp, mileage: Math.round(mileageInMiles), date, notes };

    if (remindChecked) {
      body.reminder =
        remindType === 'date'
          ? { intervalType: 'date', exactDate: remindDate }
          : { intervalType: remindType, intervalValue: Number(remindValue) };
    }

    const ok = await submit(body);
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setMileageAcknowledged(false);
    }
  }

  const remindDef = JOB_REMINDER_DEFAULTS[jobType];
  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

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
          <select id="job-type" value={jobType} onChange={(e) => handleJobChange(e.target.value)}>
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
          <label htmlFor="job-cost">Cost paid ({symbol})</label>
          <input id="job-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="job-mileage">Mileage at the time ({unitLabel})</label>
          <input id="job-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="job-notes">Notes (optional)</label>
          <textarea id="job-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. front only, done at Halfords Autocentre" />
        </div>

        <div className="field-checkbox">
          <label>
            <input type="checkbox" checked={remindChecked} onChange={(e) => handleRemindToggle(e.target.checked)} />
            🔔 Remind me when this is due again
          </label>
        </div>

        {remindChecked && (
          <div style={{ marginTop: '0.6rem', paddingLeft: '1.4rem', borderLeft: '2px solid var(--amber)' }}>
            <div className="field">
              <label htmlFor="remind-type">Track by</label>
              <select id="remind-type" value={remindType} onChange={(e) => setRemindType(e.target.value as RemindType)}>
                <option value="mileage">Mileage</option>
                <option value="months">Time (months)</option>
                <option value="date">Exact date</option>
              </select>
            </div>
            {remindType === 'date' ? (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="remind-date">Date</label>
                <input id="remind-date" type="date" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} required />
              </div>
            ) : (
              <div className="field" style={{ marginTop: '0.9rem' }}>
                <label htmlFor="remind-value">Interval</label>
                <input id="remind-value" type="number" min="1" value={remindValue} onChange={(e) => setRemindValue(e.target.value)} required />
              </div>
            )}
            {remindDef?.note && <p className="field-note" style={{ marginTop: '0.9rem' }}>{remindDef.note}</p>}
          </div>
        )}
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting || isBlocked}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
