// Place at: src/app/dashboard/LogCarServiceForm.tsx
//
// Car equivalent of LogServiceForm.tsx. CAR_JOB_LABELS is a flat,
// ~28-key catalog (no JOB_GROUPS-style grouping exists or is needed at
// this size) - a plain <select> replaces the motorcycle form's grouped
// optgroups.
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import { MileageWarning } from './MileageWarning';
import { AttachmentUploader } from './AttachmentUploader';
import { CAR_JOB_LABELS, CAR_JOB_REMINDER_DEFAULTS } from '@/lib/tracker/carJobTypes';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import type { CarReminderTrigger } from '@/lib/tracker/carReminder';

interface Props {
  initialMileage: number;
  mileageHistory: HistoryPoint[];
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  carYear?: number;
  isCustomBuild?: boolean;
}

function rowToTrigger(row: ReminderTriggerRow): CarReminderTrigger {
  return row.intervalType === 'date'
    ? { intervalType: 'date', exactDate: row.exactDate }
    : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
}

export function LogCarServiceForm({ initialMileage, mileageHistory, distanceUnit, currency, rates, carYear, isCustomBuild }: Props) {
  const [jobType, setJobType] = useState('oil-filter');
  const [costDisplay, setCostDisplay] = useState('');
  const [mileageDisplay, setMileageDisplay] = useState(String(Math.round(convertMilesToDisplay(initialMileage, distanceUnit))));
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const [remindChecked, setRemindChecked] = useState(Boolean(CAR_JOB_REMINDER_DEFAULTS['oil-filter']));
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>(
    CAR_JOB_REMINDER_DEFAULTS['oil-filter']
      ? [{ intervalType: CAR_JOB_REMINDER_DEFAULTS['oil-filter'].type, intervalValue: String(CAR_JOB_REMINDER_DEFAULTS['oil-filter'].value), exactDate: '' }]
      : []
  );
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-services');

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);
  const mileageResult = checkMileageConsistency(Math.round(mileageInMiles), date, mileageHistory, initialMileage);
  const isBlocked = mileageResult.status === 'blocked'
    || (mileageResult.status === 'warning' && !mileageAcknowledged)
    || Boolean(date && isBeforeProduction(date, { year: carYear, isCustomBuild }));

  function handleJobChange(newJobType: string) {
    setJobType(newJobType);
    const def = CAR_JOB_REMINDER_DEFAULTS[newJobType];
    setRemindChecked(Boolean(def));
    setRemindTriggers(def ? [{ intervalType: def.type, intervalValue: String(def.value), exactDate: '' }] : []);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const [primary, ...rest] = remindTriggers;
    const ok = await submit({
      jobType,
      cost: costInGbp,
      mileage: Math.round(mileageInMiles),
      date,
      notes,
      attachments: attachment ? [attachment] : undefined,
      mileageAcknowledged,
      reminder: remindChecked && primary ? { ...rowToTrigger(primary), additionalTriggers: rest.map(rowToTrigger) } : undefined,
    });
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setMileageAcknowledged(false);
      setAttachment(null);
    }
  }

  const unitLabel = distanceUnitLabel(distanceUnit);

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a service or repair</span>
        <div className="field">
          <label htmlFor="carsvc-date">Date</label>
          <input id="carsvc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: carYear, isCustomBuild }) && (
            <p className="error-text" role="alert" style={{ marginTop: '0.4rem' }}>
              This date is before {carYear}, when this car was made.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carsvc-jobtype">Job</label>
          <select id="carsvc-jobtype" value={jobType} onChange={(e) => handleJobChange(e.target.value)}>
            {Object.entries(CAR_JOB_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carsvc-cost">Cost paid ({CURRENCY_SYMBOLS[currency]})</label>
          <input id="carsvc-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carsvc-mileage">Mileage at the time ({unitLabel})</label>
          <input id="carsvc-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carsvc-notes">Notes (optional)</label>
          <textarea id="carsvc-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="carsvc" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay) || 0, currency, rates), date }} />
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <ReminderFields
            checked={remindChecked}
            onCheckedChange={setRemindChecked}
            triggers={remindTriggers}
            onTriggersChange={setRemindTriggers}
            idPrefix="carsvc"
            checkboxLabel="🔔 Remind me when this is due again"
            note={CAR_JOB_REMINDER_DEFAULTS[jobType]?.note}
          />
        </div>
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
