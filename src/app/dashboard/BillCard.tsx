// Place at: src/app/dashboard/BillCard.tsx
'use client';

import { useState } from 'react';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import type { BillDoc } from '@/lib/tracker/bill';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

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
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/bills/${encodeURIComponent(bill.id)}`);

  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ billType, cost: costInGbp, date, notes }, 'PATCH');
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
