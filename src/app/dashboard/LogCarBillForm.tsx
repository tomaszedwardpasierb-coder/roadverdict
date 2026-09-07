// Place at: src/app/dashboard/LogCarBillForm.tsx
//
// Car equivalent of LogBillForm.tsx - deliberately one-off only, no
// instalment-plan path. CarBillDoc has no seriesId/seriesIndex/source
// fields at all (see the ADR: billSeries.ts has no car equivalent yet,
// out of scope for this build), so there's nothing for a plan submit to
// attach to. Otherwise a straight mirror: no mileage concept (bills
// aren't mileage-checked), same production-year gate.
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import { AttachmentUploader } from './AttachmentUploader';
import { CAR_BILL_LABELS } from '@/lib/tracker/carBillTypes';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import type { CarReminderTrigger } from '@/lib/tracker/carReminder';

interface Props {
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

export function LogCarBillForm({ currency, rates, carYear, isCustomBuild }: Props) {
  const [billType, setBillType] = useState('insurance');
  const [costDisplay, setCostDisplay] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [remindChecked, setRemindChecked] = useState(true);
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>([
    { intervalType: 'months', intervalValue: '12', exactDate: '' },
  ]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-bills');

  const isBeforeCarProduction = Boolean(date && isBeforeProduction(date, { year: carYear, isCustomBuild }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBeforeCarProduction) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const [primary, ...rest] = remindTriggers;
    const ok = await submit({
      billType,
      cost: costInGbp,
      date,
      notes,
      attachments: attachment ? [attachment] : undefined,
      reminder: remindChecked && primary ? { ...rowToTrigger(primary), additionalTriggers: rest.map(rowToTrigger) } : undefined,
    });
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setAttachment(null);
    }
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log insurance, tax, MOT, or a charge</span>
        <div className="field">
          <label htmlFor="carbill-type">Type</label>
          <select id="carbill-type" value={billType} onChange={(e) => setBillType(e.target.value)}>
            {Object.entries(CAR_BILL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        {(billType === 'insurance' || billType === 'finance') && (
          <p className="field-note" style={{ marginTop: '0.4rem' }}>
            {billType === 'insurance' ? 'Insurance' : 'Finance'} costs are personal to you as owner, and are excluded
            from a shareable buyer report by default.
          </p>
        )}
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carbill-date">Date</label>
          <input id="carbill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {isBeforeCarProduction && (
            <p className="error-text" role="alert" style={{ marginTop: '0.4rem' }}>
              This date is before {carYear}, when this car was made.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carbill-cost">Cost paid ({CURRENCY_SYMBOLS[currency]})</label>
          <input id="carbill-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carbill-notes">Notes (optional)</label>
          <textarea id="carbill-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="carbill" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay) || 0, currency, rates), date }} />
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <ReminderFields
            checked={remindChecked}
            onCheckedChange={setRemindChecked}
            triggers={remindTriggers}
            onTriggersChange={setRemindTriggers}
            idPrefix="carbill"
            checkboxLabel="🔔 Remind me when this is due for renewal"
          />
        </div>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting || isBeforeCarProduction}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
