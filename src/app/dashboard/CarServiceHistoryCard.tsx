// Place at: src/app/dashboard/CarServiceHistoryCard.tsx
//
// Deliberately simpler than ServiceHistoryCard.tsx: no mileage-conflict-
// modal (edits rely on the server's own checkMileageConsistency, already
// wired into car-services/[id]/route.ts - a conflict simply surfaces as
// the server's own error message on save, same as a first-time log would
// show via MileageWarning), no affiliate-parts nudge (CAR_JOB_LABELS has
// no AFFILIATE_LINKS equivalent yet). View/edit toggle + delete, same as
// every other tracker card in spirit. Price-benchmark verdict and
// receipt-attachment support (view + edit) mirror ServiceHistoryCard.tsx
// in full now that car pricing data exists (see carPriceData.ts).
'use client';

import { useState } from 'react';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import { CAR_JOB_LABELS, isCleaningCarJob, isBenchmarkedCarJob } from '@/lib/tracker/carJobTypes';
import { getAdjustedCarBenchmark, type CarBenchmarkClass, type CarRegion } from '@/lib/carPriceData';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { CarServiceRecordDoc } from '@/lib/tracker/carServiceRecord';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './dashboard.module.css';
import ownStyles from './CarServiceHistoryCard.module.css';

interface Verdict {
  label: string;
  cls: 'fair' | 'high' | 'second-opinion';
  low: number;
  high: number;
}

function computeCarVerdict(
  jobType: string,
  carClass: CarBenchmarkClass | undefined,
  brandValue: string,
  region: CarRegion | undefined,
  cost: number
): Verdict | null {
  if (!carClass || !region) return null;
  if (!isBenchmarkedCarJob(jobType)) return null;
  const bench = getAdjustedCarBenchmark(jobType, carClass, brandValue, region);
  if (cost <= bench.high) return { label: 'Fair', cls: 'fair', low: bench.low, high: bench.high };
  if (cost <= bench.high * 1.25) return { label: 'High', cls: 'high', low: bench.low, high: bench.high };
  return { label: 'Second opinion', cls: 'second-opinion', low: bench.low, high: bench.high };
}

interface Props {
  record: CarServiceRecordDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  includeCleaningInReport?: boolean;
  carClass?: CarBenchmarkClass;
  brandValue: string;
  region?: CarRegion;
}

export function CarServiceHistoryCard({ record, distanceUnit, currency, rates, includeCleaningInReport = false, carClass, brandValue, region }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [jobType, setJobType] = useState(record.jobType);
  const [cost, setCost] = useState(String(record.cost));
  const [mileage, setMileage] = useState(String(record.mileage));
  const [date, setDate] = useState(record.date.slice(0, 10));
  const [notes, setNotes] = useState(record.notes ?? '');
  const [attachment, setAttachment] = useState<Attachment | null>(record.attachments?.[0] ?? null);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/cars/car-services/${record.id}`);

  const verdict = computeCarVerdict(record.jobType, carClass, brandValue, region, record.cost);
  const tagClass =
    verdict?.cls === 'fair' ? ownStyles.tagFair : verdict?.cls === 'high' ? styles.tagHigh : ownStyles.tagSecondOpinion;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit(
      { jobType, cost: Number(cost), mileage: Number(mileage), date, notes, attachments: attachment ? [attachment] : [] },
      'PATCH'
    );
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this service record?')) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className={styles.card} onSubmit={handleSave} style={{ marginTop: '0.6rem' }}>
        <div className="field">
          <label htmlFor={`carsvc-edit-job-${record.id}`}>Job</label>
          <select id={`carsvc-edit-job-${record.id}`} value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {Object.entries(CAR_JOB_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-date-${record.id}`}>Date</label>
          <input id={`carsvc-edit-date-${record.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-cost-${record.id}`}>Cost paid</label>
          <input id={`carsvc-edit-cost-${record.id}`} type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-mileage-${record.id}`}>Mileage</label>
          <input id={`carsvc-edit-mileage-${record.id}`} type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.6rem' }}>
          <label htmlFor={`carsvc-edit-notes-${record.id}`}>Notes</label>
          <textarea id={`carsvc-edit-notes-${record.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-carsvc-${record.id}`} compareValues={{ cost: Number(cost) || 0, date }} />
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting && <VehicleSpinner kind="car" size={20} />}
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(false)} disabled={submitting}>Cancel</button>
        </div>
        {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
      </form>
    );
  }

  return (
    <div className={styles.card} style={{ marginTop: '0.6rem' }}>
      {record.needsReview && <p className="field-note" style={{ marginBottom: '0.4rem' }}>🧠 Scanned from a receipt - please check this over.</p>}
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.4rem' }}>
        <strong>{CAR_JOB_LABELS[record.jobType] ?? record.jobType}</strong>
        <span>{formatCurrency(record.cost, currency, rates)}</span>
      </div>
      <div style={{ fontSize: '0.85rem', color: 'var(--ink-soft)', marginTop: '0.2rem' }}>
        {new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · {formatDistance(record.mileage, distanceUnit)}
      </div>
      {isCleaningCarJob(record.jobType) && !includeCleaningInReport && (
        <p style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--ink-soft)' }}>Not shown in buyer report</p>
      )}
      {record.notes && <p style={{ marginTop: '0.4rem' }}>{record.notes}</p>}
      {record.attachments?.[0] && <AttachmentThumb attachment={record.attachments[0]} />}
      {verdict && (
        <span className={`${ownStyles.tag} ${tagClass}`}>
          {verdict.label} (typical {formatCurrency(verdict.low, currency, rates)}-{formatCurrency(verdict.high, currency, rates)})
        </span>
      )}
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem' }}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting && <VehicleSpinner kind="car" size={20} />}
          Delete
        </button>
      </div>
      {error && <p className="error-text" role="alert" style={{ marginTop: '0.5rem' }}>{error}</p>}
    </div>
  );
}
