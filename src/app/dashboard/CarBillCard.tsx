// Place at: src/app/dashboard/CarBillCard.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { CAR_BILL_LABELS } from '@/lib/tracker/carBillTypes';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import type { CarBillDoc } from '@/lib/tracker/carBill';
import styles from './dashboard.module.css';

interface Props {
  bill: CarBillDoc;
  currency: Currency;
  rates: ExchangeRates | null;
  includeInsuranceInReport?: boolean;
  includeFinanceInReport?: boolean;
}

export function CarBillCard({ bill, currency, rates, includeInsuranceInReport = false, includeFinanceInReport = false }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [billType, setBillType] = useState(bill.billType);
  const [cost, setCost] = useState(String(bill.cost));
  const [date, setDate] = useState(bill.date.slice(0, 10));
  const [notes, setNotes] = useState(bill.notes ?? '');
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/cars/car-bills/${bill.id}`);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ billType, cost: Number(cost), date, notes }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this bill?')) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className={styles.card} onSubmit={handleSave} style={{ marginTop: '0.6rem' }}>
        <div className="field">
          <label htmlFor={`carbill-edit-type-${bill.id}`}>Type</label>
          <select id={`carbill-edit-type-${bill.id}`} value={billType} onChange={(e) => setBillType(e.target.value)}>
            {Object.entries(CAR_BILL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carbill-edit-date-${bill.id}`}>Date</label>
          <input id={`carbill-edit-date-${bill.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carbill-edit-cost-${bill.id}`}>Cost paid</label>
          <input id={`carbill-edit-cost-${bill.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carbill-edit-notes-${bill.id}`}>Notes</label>
          <textarea id={`carbill-edit-notes-${bill.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
          <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(false)} disabled={submitting}>Cancel</button>
        </div>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
      </form>
    );
  }

  return (
    <div className={styles.card} style={{ marginTop: '0.6rem' }}>
      {bill.needsReview && <p className="field-note" style={{ marginBottom: '0.4rem' }}>🧠 Scanned from a receipt - please check this over.</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <strong>{CAR_BILL_LABELS[bill.billType] ?? bill.billType}</strong>
        <span>{formatCurrency(bill.cost, currency, rates)}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
        {new Date(bill.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        {bill.mileage != null && ` · ${bill.mileage.toLocaleString()} mi (MOT-recorded, not editable here)`}
      </div>
      {bill.billType === 'insurance' && !includeInsuranceInReport && (
        <div className={styles.jobCardMeta}>Not shown in buyer report</div>
      )}
      {bill.billType === 'finance' && !includeFinanceInReport && (
        <div className={styles.jobCardMeta}>Not shown in buyer report</div>
      )}
      {bill.notes && <p style={{ marginTop: '0.4rem' }}>{bill.notes}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>Delete</button>
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
