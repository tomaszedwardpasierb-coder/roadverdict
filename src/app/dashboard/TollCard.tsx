// Place at: src/app/dashboard/TollCard.tsx
//
// Identical shape to FineCard.tsx - see that file's own comment.
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { TOLL_LABELS } from '@/lib/tracker/tollTypes';
import type { TollDoc } from '@/lib/tracker/toll';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function TollCard({
  toll,
  currency,
  rates,
  includeTollsInReport,
}: {
  toll: TollDoc;
  currency: Currency;
  rates: ExchangeRates | null;
  includeTollsInReport?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tollType, setTollType] = useState(toll.tollType);
  const [costDisplay, setCostDisplay] = useState(convertGbpToDisplay(toll.cost, currency, rates).toFixed(2));
  const [date, setDate] = useState(toll.date);
  const [notes, setNotes] = useState(toll.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(toll.attachments?.[0] ?? null);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/tolls/${encodeURIComponent(toll.id)}`);

  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ tollType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : [] }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this toll? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-toll-date-${toll.id}`}>Date</label>
            <input id={`edit-toll-date-${toll.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-toll-type-${toll.id}`}>Toll or charge</label>
            <select id={`edit-toll-type-${toll.id}`} value={tollType} onChange={(e) => setTollType(e.target.value)}>
              {Object.entries(TOLL_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-toll-cost-${toll.id}`}>Cost ({symbol})</label>
            <input id={`edit-toll-cost-${toll.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-toll-notes-${toll.id}`}>Notes</label>
            <textarea id={`edit-toll-notes-${toll.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-toll-${toll.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting && <VehicleSpinner kind="bike" size={20} />}
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
        <span className={styles.jobCardJob}>{TOLL_LABELS[toll.tollType] ?? toll.tollType}</span>
        <span className={styles.jobCardCost}>{formatCurrency(toll.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>{fmtDate(toll.date)}</div>
      {!includeTollsInReport && <div className={styles.jobCardMeta}>Not shown in buyer report</div>}
      {toll.notes && <div className={styles.jobCardNotes}>{toll.notes}</div>}
      {toll.attachments?.[0] && <AttachmentThumb attachment={toll.attachments[0]} />}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting && <VehicleSpinner kind="bike" size={20} />}
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
