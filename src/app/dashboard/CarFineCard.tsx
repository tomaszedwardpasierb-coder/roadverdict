// Place at: src/app/dashboard/CarFineCard.tsx
//
// Car equivalent of FineCard.tsx.
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { CAR_FINE_LABELS as FINE_LABELS } from '@/lib/tracker/carFineTypes';
import type { CarFineDoc } from '@/lib/tracker/carFine';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function CarFineCard({
  fine,
  currency,
  rates,
  includeFinesInReport,
}: {
  fine: CarFineDoc;
  currency: Currency;
  rates: ExchangeRates | null;
  includeFinesInReport?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [fineType, setFineType] = useState(fine.fineType);
  const [costDisplay, setCostDisplay] = useState(convertGbpToDisplay(fine.cost, currency, rates).toFixed(2));
  const [date, setDate] = useState(fine.date);
  const [notes, setNotes] = useState(fine.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(fine.attachments?.[0] ?? null);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/cars/car-fines/${encodeURIComponent(fine.id)}`);

  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ fineType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : [] }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this fine? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-car-fine-date-${fine.id}`}>Date</label>
            <input id={`edit-car-fine-date-${fine.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-car-fine-type-${fine.id}`}>Type of fine</label>
            <select id={`edit-car-fine-type-${fine.id}`} value={fineType} onChange={(e) => setFineType(e.target.value)}>
              {Object.entries(FINE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-car-fine-cost-${fine.id}`}>Cost ({symbol})</label>
            <input id={`edit-car-fine-cost-${fine.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-car-fine-notes-${fine.id}`}>Notes</label>
            <textarea id={`edit-car-fine-notes-${fine.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-car-fine-${fine.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting && <VehicleSpinner kind="car" size={20} />}
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
        <span className={styles.jobCardJob}>{FINE_LABELS[fine.fineType] ?? fine.fineType}</span>
        <span className={styles.jobCardCost}>{formatCurrency(fine.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>{fmtDate(fine.date)}</div>
      {!includeFinesInReport && <div className={styles.jobCardMeta}>Not shown in buyer report</div>}
      {fine.notes && <div className={styles.jobCardNotes}>{fine.notes}</div>}
      {fine.attachments?.[0] && <AttachmentThumb attachment={fine.attachments[0]} />}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting && <VehicleSpinner kind="car" size={20} />}
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
