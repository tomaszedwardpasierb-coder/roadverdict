// Place at: src/app/dashboard/LogBillForm.tsx
'use client';

import { useState } from 'react';
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from '@/lib/tracker/billTypes';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import type { ReminderTrigger } from '@/lib/tracker/reminder';

export function LogBillForm({
  currency,
  rates,
  bikeYear,
  isCustomBuild,
}: {
  currency: Currency;
  rates: ExchangeRates | null;
  bikeYear?: number;
  isCustomBuild?: boolean;
}) {
  const [billType, setBillType] = useState('insurance');
  const [costDisplay, setCostDisplay] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [remindChecked, setRemindChecked] = useState(true);
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>([
    { intervalType: 'months', intervalValue: '12', exactDate: '' },
  ]);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bills');

  function handleBillTypeChange(newType: string) {
    setBillType(newType);
    if (remindChecked) {
      const def = BILL_REMINDER_DEFAULTS[newType];
      setRemindTriggers([{ intervalType: def ? def.type : 'months', intervalValue: def ? String(def.value) : '12', exactDate: '' }]);
    }
  }

  function rowToTrigger(row: ReminderTriggerRow): ReminderTrigger {
    return row.intervalType === 'date'
      ? { intervalType: 'date', exactDate: row.exactDate }
      : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (date && isBeforeProduction(date, { year: bikeYear, isCustomBuild })) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const body: {
      billType: string;
      cost: number;
      date: string;
      notes: string;
      attachments?: Attachment[];
      reminder?: ReminderTrigger & { additionalTriggers?: ReminderTrigger[] };
    } = { billType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : undefined };

    if (remindChecked && remindTriggers.length > 0) {
      const [primary, ...rest] = remindTriggers.map(rowToTrigger);
      body.reminder = rest.length > 0 ? { ...primary, additionalTriggers: rest } : primary;
    }

    const ok = await submit(body);
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setAttachment(null);
    }
  }

  const symbol = CURRENCY_SYMBOLS[currency];

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log insurance, tax, or an MOT</span>
        <div className="field">
          <label htmlFor="bill-date">Date</label>
          <input id="bill-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: bikeYear, isCustomBuild }) && (
            <p className="error-text" role="alert">
              This date is before {bikeYear}, when this bike was made - it couldn&apos;t have been insured, taxed, or
              tested before it existed. Double-check the date.
            </p>
          )}
          {date && isBackdated(date, new Date().toISOString()) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              {backdateNotice(date, new Date().toISOString())} - this will be flagged in your buyer report
              (softened if you attach a receipt) to help build trust in your history, not hide it.
            </p>
          )}
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
          <label htmlFor="bill-cost">Cost ({symbol})</label>
          <input id="bill-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bill-notes">Notes (optional)</label>
          <textarea id="bill-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fully comprehensive, Bennetts" />
        </div>
        <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="-bill" />

        <ReminderFields
          checked={remindChecked}
          onCheckedChange={setRemindChecked}
          triggers={remindTriggers}
          onTriggersChange={setRemindTriggers}
          idPrefix="remind-bill"
          checkboxLabel="🔔 Remind me when this is due for renewal"
        />
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting || (date ? isBeforeProduction(date, { year: bikeYear, isCustomBuild }) : false)}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
