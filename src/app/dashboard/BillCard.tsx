// Place at: src/app/dashboard/BillCard.tsx
'use client';

import { useState } from 'react';
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from '@/lib/tracker/billTypes';
import type { BillDoc } from '@/lib/tracker/bill';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type RemindType = 'mileage' | 'months' | 'date';

export function BillCard({
  bill,
  currency,
  rates,
}: {
  bill: BillDoc;
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [billType, setBillType] = useState(bill.billType);
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(bill.cost, currency, rates).toFixed(2)
  );
  const [date, setDate] = useState(bill.date);
  const [notes, setNotes] = useState(bill.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(bill.attachments?.[0] ?? null);
  const [remindChecked, setRemindChecked] = useState(false);
  const [remindType, setRemindType] = useState<RemindType>('months');
  const [remindValue, setRemindValue] = useState('12');
  const [remindDate, setRemindDate] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/bills/${encodeURIComponent(bill.id)}`);

  const symbol = CURRENCY_SYMBOLS[currency];

  function handleRemindToggle(checked: boolean) {
    setRemindChecked(checked);
    if (checked) {
      const def = BILL_REMINDER_DEFAULTS[billType];
      setRemindType(def ? def.type : 'months');
      setRemindValue(def ? String(def.value) : '12');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const body: {
      billType: string;
      cost: number;
      date: string;
      notes: string;
      attachments?: Attachment[];
      reminder?: { intervalType: RemindType; intervalValue?: number; exactDate?: string };
    } = { billType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : [] };

    if (remindChecked) {
      body.reminder =
        remindType === 'date'
          ? { intervalType: 'date', exactDate: remindDate }
          : { intervalType: remindType, intervalValue: Number(remindValue) };
    }

    const ok = await submit(body, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this entry? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-bill-date-${bill.id}`}>Date</label>
            <input id={`edit-bill-date-${bill.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-bill-type-${bill.id}`}>Type</label>
            <select id={`edit-bill-type-${bill.id}`} value={billType} onChange={(e) => setBillType(e.target.value)}>
              {Object.entries(BILL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-bill-cost-${bill.id}`}>Cost ({symbol})</label>
            <input id={`edit-bill-cost-${bill.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-bill-notes-${bill.id}`}>Notes</label>
            <textarea id={`edit-bill-notes-${bill.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-bill-${bill.id}`} />

          <div className="field-checkbox">
            <label>
              <input type="checkbox" checked={remindChecked} onChange={(e) => handleRemindToggle(e.target.checked)} />
              🔔 Remind me when this is due for renewal
            </label>
          </div>
          {remindChecked && (
            <div style={{ marginTop: '0.6rem', paddingLeft: '1.4rem', borderLeft: '2px solid var(--amber)' }}>
              <div className="field">
                <label htmlFor={`edit-bill-remind-type-${bill.id}`}>Track by</label>
                <select id={`edit-bill-remind-type-${bill.id}`} value={remindType} onChange={(e) => setRemindType(e.target.value as RemindType)}>
                  <option value="months">Time (months)</option>
                  <option value="mileage">Mileage</option>
                  <option value="date">Exact date</option>
                </select>
              </div>
              {remindType === 'date' ? (
                <div className="field" style={{ marginTop: '0.9rem' }}>
                  <label htmlFor={`edit-bill-remind-date-${bill.id}`}>Date</label>
                  <input id={`edit-bill-remind-date-${bill.id}`} type="date" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} required />
                </div>
              ) : (
                <div className="field" style={{ marginTop: '0.9rem' }}>
                  <label htmlFor={`edit-bill-remind-value-${bill.id}`}>Interval</label>
                  <input id={`edit-bill-remind-value-${bill.id}`} type="number" min="1" value={remindValue} onChange={(e) => setRemindValue(e.target.value)} required />
                </div>
              )}
            </div>
          )}
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(false)} disabled={submitting}>
            Cancel
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>
    );
  }

  return (
    <div className={styles.jobCard}>
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{BILL_LABELS[bill.billType] ?? bill.billType}</span>
        <span className={styles.jobCardCost}>{formatCurrency(bill.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>{fmtDate(bill.date)}</div>
      {bill.notes && <div className={styles.jobCardNotes}>{bill.notes}</div>}
      {bill.attachments?.[0] && <AttachmentThumb attachment={bill.attachments[0]} />}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
