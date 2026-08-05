// Place at: src/app/dashboard/ServiceHistoryCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { JOB_GROUPS, JOB_LABELS, JOB_REMINDER_DEFAULTS, AFFILIATE_LINKS, isBenchmarkedJob } from '@/lib/tracker/jobTypes';
import { getAdjustedBenchmark, type BikeClass, type Region } from '@/lib/priceData';
import type { ServiceRecordDoc } from '@/lib/tracker/serviceRecord';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { formatDistance, convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { ReminderFields, type ReminderTriggerRow } from './ReminderFields';
import type { ReminderTrigger } from '@/lib/tracker/reminder';
import { useTabSwitch, goToNextReview, type ReviewCategory } from './TabSwitchContext';
import { mileageConfidenceLabel } from '@/lib/tracker/mileageEstimate';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { MileageWarning } from './MileageWarning';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface Verdict {
  label: string;
  cls: 'fair' | 'high' | 'second-opinion';
  low: number;
  high: number;
}

function computeVerdict(
  jobType: string,
  bikeClass: BikeClass,
  brandValue: string,
  region: Region,
  cost: number
): Verdict | null {
  if (!isBenchmarkedJob(jobType)) return null;
  const bench = getAdjustedBenchmark(jobType, bikeClass, brandValue, region);
  if (cost <= bench.high) return { label: 'Fair', cls: 'fair', low: bench.low, high: bench.high };
  if (cost <= bench.high * 1.25) return { label: 'High', cls: 'high', low: bench.low, high: bench.high };
  return { label: 'Second opinion', cls: 'second-opinion', low: bench.low, high: bench.high };
}

interface Props {
  record: ServiceRecordDoc;
  bikeClass: BikeClass;
  brandValue: string;
  region: Region;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  pendingReviewIds: Record<ReviewCategory, string[]>;
  mileageHistory: HistoryPoint[];
  currentMileage: number;
}

export function ServiceHistoryCard({ record, bikeClass, brandValue, region, distanceUnit, currency, rates, pendingReviewIds, mileageHistory, currentMileage }: Props) {
  const { switchTo, focusId, setFocusId, highlightIds } = useTabSwitch();
  const [isEditing, setIsEditing] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [jobType, setJobType] = useState(record.jobType);
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(record.cost, currency, rates).toFixed(2)
  );
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(record.mileage, distanceUnit)))
  );
  const [date, setDate] = useState(record.date);
  const [notes, setNotes] = useState(record.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(record.attachments?.[0] ?? null);
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const mileageInMilesForCheck = Math.round(convertDisplayToMiles(Number(mileageDisplay), distanceUnit));
  const mileageResult = checkMileageConsistency(mileageInMilesForCheck, date, mileageHistory, currentMileage);
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);
  const [remindChecked, setRemindChecked] = useState(Boolean(JOB_REMINDER_DEFAULTS[record.jobType]));
  const [remindTriggers, setRemindTriggers] = useState<ReminderTriggerRow[]>(() => {
    const def = JOB_REMINDER_DEFAULTS[record.jobType];
    return [{ intervalType: def ? def.type : 'mileage', intervalValue: def ? String(def.value) : '', exactDate: '' }];
  });
  const { submit, submitting, error } = useTrackerFormSubmit(
    `/api/tracker/services/${encodeURIComponent(record.id)}`
  );

  // The moment this specific record is named as the next one to review -
  // whether because it was already on screen, or because a tab switch
  // just brought this list into view - open its edit mode automatically,
  // then clear the flag so it doesn't try to reopen itself later.
  useEffect(() => {
    if (focusId === record.id) {
      setIsEditing(true);
      setFocusId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // Navigation from a chart point or Recent Activity row, not a review
  // step - scroll into view and pulse briefly, never force edit mode.
  useEffect(() => {
    if (!highlightIds.includes(record.id)) return;
    setIsHighlighted(true);
    if (highlightIds[0] === record.id) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setIsHighlighted(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  const verdict = computeVerdict(record.jobType, bikeClass, brandValue, region, record.cost);
  const jobLabel = JOB_LABELS[record.jobType] ?? record.jobType;
  const affiliate = AFFILIATE_LINKS[record.jobType];
  const tagClass =
    verdict?.cls === 'fair' ? styles.tagFair : verdict?.cls === 'high' ? styles.tagHigh : styles.tagSecondOpinion;
  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  function handleRemindToggle(checked: boolean) {
    setRemindChecked(checked);
    if (checked) {
      const def = JOB_REMINDER_DEFAULTS[jobType];
      setRemindTriggers([{ intervalType: def ? def.type : 'mileage', intervalValue: def ? String(def.value) : '', exactDate: '' }]);
    }
  }

  function rowToTrigger(row: ReminderTriggerRow): ReminderTrigger {
    return row.intervalType === 'date'
      ? { intervalType: 'date', exactDate: row.exactDate }
      : { intervalType: row.intervalType, intervalValue: Number(row.intervalValue) };
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const body: {
      jobType: string;
      cost: number;
      mileage: number;
      date: string;
      notes: string;
      attachments?: Attachment[];
      reminder?: ReminderTrigger & { additionalTriggers?: ReminderTrigger[] };
      mileageAcknowledged?: boolean;
    } = { jobType, cost: costInGbp, mileage: mileageInMilesForCheck, date, notes, attachments: attachment ? [attachment] : [], mileageAcknowledged };

    if (remindChecked && remindTriggers.length > 0) {
      const [primary, ...rest] = remindTriggers.map(rowToTrigger);
      body.reminder = rest.length > 0 ? { ...primary, additionalTriggers: rest } : primary;
    }

    const ok = await submit(body, 'PATCH');
    if (ok) {
      setIsEditing(false);
      if (record.needsReview) goToNextReview(pendingReviewIds, 'service', record.id, switchTo, setFocusId);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this service record? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-date-${record.id}`}>Date</label>
            <input id={`edit-date-${record.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-job-${record.id}`}>Job</label>
            <select id={`edit-job-${record.id}`} value={jobType} onChange={(e) => setJobType(e.target.value)}>
              {JOB_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.jobs.map((j) => (
                    <option key={j} value={j}>{JOB_LABELS[j]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-cost-${record.id}`}>Cost paid ({symbol})</label>
            <input id={`edit-cost-${record.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mileage-${record.id}`}>Mileage ({unitLabel})</label>
            <input id={`edit-mileage-${record.id}`} type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
            <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-notes-${record.id}`}>Notes</label>
            <textarea id={`edit-notes-${record.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-service-${record.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />

          <ReminderFields
            checked={remindChecked}
            onCheckedChange={handleRemindToggle}
            triggers={remindTriggers}
            onTriggersChange={setRemindTriggers}
            idPrefix={`edit-remind-service-${record.id}`}
            checkboxLabel="🔔 Remind me when this is due again"
          />
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting || isBlocked}>
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
      className={`${styles.jobCard} ${record.needsReview ? styles.jobCardNeedsReview : ''} ${isHighlighted ? styles.cardHighlight : ''}`}
    >
      {record.needsReview && (
        <div className={styles.needsReviewNote}>
          {record.mileageConflictWarning ? (
            <>⚠️ {record.mileageConflictWarning}</>
          ) : (
            <>🧠 Auto-created from a scanned receipt - click Edit to review, especially the mileage, before it&apos;s done.</>
          )}
          {record.aiDescription && <div className={styles.aiDescriptionNote}>{record.aiDescription}</div>}
        </div>
      )}
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{jobLabel}</span>
        <span className={styles.jobCardCost}>{formatCurrency(record.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(record.date)} · {formatDistance(record.mileage, distanceUnit)}
        {record.mileageConfidence && (
          <span className={record.mileageConfidence === 'confirmed' ? styles.mileageConfirmedTag : styles.mileageConfidenceTag}>
            {mileageConfidenceLabel(record.mileageConfidence)}
          </span>
        )}
      </div>
      {record.currencyConversion && (
        <div className={styles.currencyConversionNote}>
          Originally {record.currencyConversion.originalAmount.toFixed(2)} {record.currencyConversion.originalCurrency},
          converted at the {fmtDate(record.currencyConversion.ratedAt)} rate.
        </div>
      )}
      {record.notes && <div className={styles.jobCardNotes}>{record.notes}</div>}
      {record.attachments?.[0] && <AttachmentThumb attachment={record.attachments[0]} />}
      {verdict && (
        <span className={`${styles.tag} ${tagClass}`}>
          {verdict.label} (typical {formatCurrency(verdict.low, currency, rates)}-{formatCurrency(verdict.high, currency, rates)})
        </span>
      )}
      {affiliate && (
        <div className={styles.affiliateNudge}>
          Need parts for next time?{' '}
          {affiliate.map((a) => (
            <a key={a.url} href={a.url} target="_blank" rel="noopener">{a.name}</a>
          ))}
        </div>
      )}
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
