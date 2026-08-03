// Place at: src/app/dashboard/ServiceHistoryCard.tsx
'use client';

import { useState } from 'react';
import { JOB_GROUPS, JOB_LABELS, JOB_REMINDER_DEFAULTS, AFFILIATE_LINKS, isBenchmarkedJob } from '@/lib/tracker/jobTypes';
import { getAdjustedBenchmark, type BikeClass, type Region } from '@/lib/priceData';
import type { ServiceRecordDoc } from '@/lib/tracker/serviceRecord';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { formatDistance, convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

type RemindType = 'mileage' | 'months' | 'date';

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
}

export function ServiceHistoryCard({ record, bikeClass, brandValue, region, distanceUnit, currency, rates }: Props) {
  const [isEditing, setIsEditing] = useState(false);
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
  const [remindChecked, setRemindChecked] = useState(false);
  const [remindType, setRemindType] = useState<RemindType>('mileage');
  const [remindValue, setRemindValue] = useState('');
  const [remindDate, setRemindDate] = useState('');
  const { submit, submitting, error } = useTrackerFormSubmit(
    `/api/tracker/services/${encodeURIComponent(record.id)}`
  );

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
      setRemindType(def ? def.type : 'mileage');
      setRemindValue(def ? String(def.value) : '');
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const mileageInMiles = Math.round(convertDisplayToMiles(Number(mileageDisplay), distanceUnit));
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const body: {
      jobType: string;
      cost: number;
      mileage: number;
      date: string;
      notes: string;
      attachments?: Attachment[];
      reminder?: { intervalType: RemindType; intervalValue?: number; exactDate?: string };
    } = { jobType, cost: costInGbp, mileage: mileageInMiles, date, notes, attachments: attachment ? [attachment] : [] };

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
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-notes-${record.id}`}>Notes</label>
            <textarea id={`edit-notes-${record.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-service-${record.id}`} />

          <div className="field-checkbox">
            <label>
              <input type="checkbox" checked={remindChecked} onChange={(e) => handleRemindToggle(e.target.checked)} />
              🔔 Remind me when this is due again
            </label>
          </div>
          {remindChecked && (
            <div style={{ marginTop: '0.6rem', paddingLeft: '1.4rem', borderLeft: '2px solid var(--amber)' }}>
              <div className="field">
                <label htmlFor={`edit-remind-type-${record.id}`}>Track by</label>
                <select id={`edit-remind-type-${record.id}`} value={remindType} onChange={(e) => setRemindType(e.target.value as RemindType)}>
                  <option value="mileage">Mileage</option>
                  <option value="months">Time (months)</option>
                  <option value="date">Exact date</option>
                </select>
              </div>
              {remindType === 'date' ? (
                <div className="field" style={{ marginTop: '0.9rem' }}>
                  <label htmlFor={`edit-remind-date-${record.id}`}>Date</label>
                  <input id={`edit-remind-date-${record.id}`} type="date" value={remindDate} onChange={(e) => setRemindDate(e.target.value)} required />
                </div>
              ) : (
                <div className="field" style={{ marginTop: '0.9rem' }}>
                  <label htmlFor={`edit-remind-value-${record.id}`}>Interval</label>
                  <input id={`edit-remind-value-${record.id}`} type="number" min="1" value={remindValue} onChange={(e) => setRemindValue(e.target.value)} required />
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
        <span className={styles.jobCardJob}>{jobLabel}</span>
        <span className={styles.jobCardCost}>{formatCurrency(record.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(record.date)} · {formatDistance(record.mileage, distanceUnit)}
      </div>
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
