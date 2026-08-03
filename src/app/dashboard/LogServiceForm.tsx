// Place at: src/app/dashboard/LogServiceForm.tsx
'use client';

import { useState, useMemo } from 'react';
import { JOB_GROUPS, JOB_LABELS, JOB_REMINDER_DEFAULTS } from '@/lib/tracker/jobTypes';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';
import { AttachmentUploader } from './AttachmentUploader';
import { ReminderFields, type ReminderTriggerRow, type RemindType } from './ReminderFields';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import type { ReminderTrigger } from '@/lib/tracker/reminder';

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
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>([
    { intervalType: 'mileage', intervalValue: '', exactDate: '' },
  ]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/services');

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);

  const mileageResult = useMemo(
    () => checkMileageConsistency(mileageInMiles, date, mileageHistory, initialMileage),
    [mileageInMiles, date, mileageHistory, initialMileage]
  );
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);

  function applyDefaults(forJobType: string) {
    const def = JOB_REMINDER_DEFAULTS[forJobType];
    setRemindTriggers([{ intervalType: def ? def.type : 'mileage', intervalValue: def ? String(def.value) : '', exactDate: '' }]);
  }

  function handleRemindToggle(checked: boolean) {
    setRemindChecked(checked);
    if (checked) applyDefaults(jobType);
  }

  function handleJobChange(newJobType: string) {
    setJobType(newJobType);
    if (remindChecked) applyDefaults(newJobType);
  }

  function rowToTrigger(row: ReminderTriggerRow): ReminderTrigger {
    return row.intervalType === 'date'
      ? { intervalType: 'date', exactDate: row.exactDate }
      : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
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
      attachments?: Attachment[];
      reminder?: ReminderTrigger & { additionalTriggers?: ReminderTrigger[] };
    } = { jobType, cost: costInGbp, mileage: Math.round(mileageInMiles), date, notes, attachments: attachment ? [attachment] : undefined };

    if (remindChecked && remindTriggers.length > 0) {
      const [primary, ...rest] = remindTriggers.map(rowToTrigger);
      body.reminder = rest.length > 0 ? { ...primary, additionalTriggers: rest } : primary;
    }

    const ok = await submit(body);
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setMileageAcknowledged(false);
      setAttachment(null);
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
          {date && isBackdated(date, new Date().toISOString()) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              {backdateNotice(date, new Date().toISOString())} - this will be flagged in your buyer report
              (softened if you attach a receipt) to help build trust in your history, not hide it.
            </p>
          )}
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
        <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="-service" />

        <ReminderFields
          checked={remindChecked}
          onCheckedChange={handleRemindToggle}
          triggers={remindTriggers}
          onTriggersChange={setRemindTriggers}
          idPrefix="remind-service"
          checkboxLabel="🔔 Remind me when this is due again"
          note={remindDef?.note}
        />
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
