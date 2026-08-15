// Place at: src/app/dashboard/BillCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { BILL_LABELS, BILL_REMINDER_DEFAULTS } from '@/lib/tracker/billTypes';
import type { BillDoc } from '@/lib/tracker/bill';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import type { ReminderTrigger } from '@/lib/tracker/reminder';
import { useTabSwitch, goToNextReview, type ReviewCategory } from './TabSwitchContext';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function BillCard({
  bill,
  currency,
  rates,
  pendingReviewIds,
  distanceUnit,
}: {
  bill: BillDoc;
  currency: Currency;
  rates: ExchangeRates | null;
  pendingReviewIds: Record<ReviewCategory, string[]>;
  distanceUnit: DistanceUnit;
}) {
  const { switchTo, focusId, setFocusId, highlightIds } = useTabSwitch();
  const [isEditing, setIsEditing] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [billType, setBillType] = useState(bill.billType);
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(bill.cost, currency, rates).toFixed(2)
  );
  const [date, setDate] = useState(bill.date);
  const [notes, setNotes] = useState(bill.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(bill.attachments?.[0] ?? null);
  const [remindChecked, setRemindChecked] = useState(Boolean(BILL_REMINDER_DEFAULTS[bill.billType]));
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>(() => {
    const def = BILL_REMINDER_DEFAULTS[bill.billType];
    return [{ intervalType: def ? def.type : 'months', intervalValue: def ? String(def.value) : '12', exactDate: '' }];
  });
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/bills/${encodeURIComponent(bill.id)}`);

  useEffect(() => {
    if (focusId === bill.id) {
      setIsEditing(true);
      setFocusId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!highlightIds.includes(bill.id)) return;
    setIsHighlighted(true);
    if (highlightIds[0] === bill.id) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setIsHighlighted(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  const symbol = CURRENCY_SYMBOLS[currency];

  function handleRemindToggle(checked: boolean) {
    setRemindChecked(checked);
    if (checked) {
      const def = BILL_REMINDER_DEFAULTS[billType];
      setRemindTriggers([{ intervalType: def ? def.type : 'months', intervalValue: def ? String(def.value) : '12', exactDate: '' }]);
    }
  }

  function rowToTrigger(row: ReminderTriggerRow): ReminderTrigger {
    return row.intervalType === 'date'
      ? { intervalType: 'date', exactDate: row.exactDate }
      : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
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
      reminder?: ReminderTrigger & { additionalTriggers?: ReminderTrigger[] };
    } = { billType, cost: costInGbp, date, notes, attachments: attachment ? [attachment] : [] };

    if (remindChecked && remindTriggers.length > 0) {
      const [primary, ...rest] = remindTriggers.map(rowToTrigger);
      body.reminder = rest.length > 0 ? { ...primary, additionalTriggers: rest } : primary;
    }

    const ok = await submit(body, 'PATCH');
    if (ok) {
      setIsEditing(false);
      if (bill.needsReview) goToNextReview(pendingReviewIds, 'bills', bill.id, switchTo, setFocusId);
    }
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
          {bill.mileage != null && (
            <p className="field-note" style={{ marginTop: '0.6rem' }}>
              DVSA-recorded mileage: <strong>{formatDistance(bill.mileage, distanceUnit)}</strong> - not editable here,
              since it&apos;s a verified fact from the MOT test itself, not something entered by hand.
            </p>
          )}
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-bill-${bill.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />

          <ReminderFields
            checked={remindChecked}
            onCheckedChange={handleRemindToggle}
            triggers={remindTriggers}
            onTriggersChange={setRemindTriggers}
            idPrefix={`edit-remind-bill-${bill.id}`}
            checkboxLabel="🔔 Remind me when this is due for renewal"
          />
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
    <div
      ref={cardRef}
      className={`${styles.jobCard} ${bill.needsReview ? styles.jobCardNeedsReview : ''} ${isHighlighted ? styles.cardHighlight : ''}`}
    >
      {bill.needsReview && (
        <div className={styles.needsReviewNote}>
          🧠 Auto-created from a scanned receipt - click Edit to review before it's done.
          {bill.aiDescription && <div className={styles.aiDescriptionNote}>{bill.aiDescription}</div>}
        </div>
      )}
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{BILL_LABELS[bill.billType] ?? bill.billType}</span>
        <span className={styles.jobCardCost}>{formatCurrency(bill.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>{fmtDate(bill.date)}</div>
      {bill.mileage != null && (
        <div className={styles.jobCardMeta}>DVSA-recorded mileage: {formatDistance(bill.mileage, distanceUnit)}</div>
      )}
      {bill.currencyConversion && (
        <div className={styles.currencyConversionNote}>
          Originally {bill.currencyConversion.originalAmount.toFixed(2)} {bill.currencyConversion.originalCurrency},
          converted at the {fmtDate(bill.currencyConversion.ratedAt)} rate.
        </div>
      )}
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
