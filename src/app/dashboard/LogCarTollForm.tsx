// Place at: src/app/dashboard/LogCarTollForm.tsx
//
// Car equivalent of LogTollForm.tsx.
'use client';

import { useState } from 'react';
import { TOLL_LABELS } from '@/lib/tracker/tollTypes';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './dashboard.module.css';

export function LogCarTollForm({
  currency,
  rates,
  carYear,
  isCustomBuild,
}: {
  currency: Currency;
  rates: ExchangeRates | null;
  carYear?: number;
  isCustomBuild?: boolean;
}) {
  const [tollType, setTollType] = useState(Object.keys(TOLL_LABELS)[0]);
  const [costDisplay, setCostDisplay] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-tolls');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ tollType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : undefined });
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
        <span className="ticket__label">Log a toll</span>
        <div className="field">
          <label htmlFor="car-toll-date">Date</label>
          <input id="car-toll-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: carYear, isCustomBuild }) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              This date is before {carYear}, when this car was made.
            </p>
          )}
          {date && isBackdated(date, new Date().toISOString()) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              {backdateNotice(date, new Date().toISOString())} - this will be flagged in your buyer report
              (softened if you attach evidence) to help build trust in your history, not hide it.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-toll-type">Toll or charge</label>
          <select id="car-toll-type" value={tollType} onChange={(e) => setTollType(e.target.value)}>
            {Object.entries(TOLL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-toll-cost">Cost ({symbol})</label>
          <input id="car-toll-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-toll-notes">Notes (optional)</label>
          <textarea id="car-toll-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. return trip" />
        </div>
        <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="-car-toll" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className={styles.scanReceiptBtn} type="submit" disabled={submitting || !costDisplay}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
