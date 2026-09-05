// Place at: src/components/AssistantProposedEntryCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { JOB_GROUPS, JOB_LABELS } from '@/lib/tracker/jobTypes';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import styles from './AssistantProposedEntryCard.module.css';

export interface ProposedServiceEntry {
  category: 'service';
  jobType: string;
  jobLabel: string;
  description: string;
  cost: number;
  date: string;
  mileage: number;
}

export interface ProposedBillEntry {
  category: 'bill';
  billType: string;
  billLabel: string;
  description: string;
  cost: number;
  date: string;
}

export type ProposedEntry = ProposedServiceEntry | ProposedBillEntry;

const ENDPOINT: Record<ProposedEntry['category'], string> = {
  service: '/api/tracker/services',
  bill: '/api/tracker/bills',
};

// Renders the AI assistant's draft for a new service record or bill,
// pre-filled but fully editable - "Log it" always POSTs to the exact
// same endpoint the manual dashboard forms use, so every existing
// server-side check (mileage consistency, production-year, etc.) still
// applies. This never writes anything on its own; only the person's own
// click does.
export function AssistantProposedEntryCard({ entry }: { entry: ProposedEntry }) {
  const router = useRouter();
  const [jobType, setJobType] = useState(entry.category === 'service' ? entry.jobType : '');
  const [billType, setBillType] = useState(entry.category === 'bill' ? entry.billType : '');
  const [description, setDescription] = useState(entry.description);
  const [cost, setCost] = useState(String(entry.cost));
  const [date, setDate] = useState(entry.date);
  const [mileage, setMileage] = useState(entry.category === 'service' ? String(entry.mileage) : '');
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState(false);

  async function handleConfirm(acknowledgeMileage: boolean) {
    setSubmitting(true);
    setError(null);

    const costValue = Number(cost);
    if (!Number.isFinite(costValue) || costValue <= 0) {
      setError('Enter a valid cost.');
      setSubmitting(false);
      return;
    }

    const body =
      entry.category === 'service'
        ? { jobType, cost: costValue, mileage: Number(mileage), date, notes: description, mileageAcknowledged: acknowledgeMileage || mileageAcknowledged }
        : { billType, cost: costValue, date, notes: description };

    try {
      const res = await fetch(ENDPOINT[entry.category], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }
      setLogged(true);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (logged) {
    return (
      <div className={styles.card}>
        <p className={styles.loggedNote}>
          ✓ Logged - {entry.category === 'service' ? (JOB_LABELS[jobType] ?? jobType) : (BILL_LABELS[billType] ?? billType)}
        </p>
      </div>
    );
  }

  // A heuristic, not a status code check (fetch here doesn't carry one
  // through) - every mileage-consistency message from describeMileageCheck
  // mentions "miles", which nothing else this endpoint returns does.
  const offerMileageOverride = entry.category === 'service' && !!error && /miles/i.test(error) && !mileageAcknowledged;

  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{entry.category === 'service' ? 'New service record' : 'New bill'}</span>

      {entry.category === 'service' ? (
        <div className={styles.field}>
          <label htmlFor="ai-job-type">Job</label>
          <select id="ai-job-type" value={jobType} onChange={(e) => setJobType(e.target.value)} disabled={submitting}>
            {JOB_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{JOB_LABELS[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      ) : (
        <div className={styles.field}>
          <label htmlFor="ai-bill-type">Bill type</label>
          <select id="ai-bill-type" value={billType} onChange={(e) => setBillType(e.target.value)} disabled={submitting}>
            {Object.entries(BILL_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="ai-description">Description</label>
        <input id="ai-description" type="text" value={description} onChange={(e) => setDescription(e.target.value)} disabled={submitting} />
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor="ai-cost">Cost (£)</label>
          <input id="ai-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} disabled={submitting} />
        </div>
        <div className={styles.field}>
          <label htmlFor="ai-date">Date</label>
          <input id="ai-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
        </div>
      </div>

      {entry.category === 'service' && (
        <div className={styles.field}>
          <label htmlFor="ai-mileage">Mileage</label>
          <input id="ai-mileage" type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} disabled={submitting} />
        </div>
      )}

      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.confirmBtn} onClick={() => handleConfirm(false)} disabled={submitting}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {offerMileageOverride && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => {
              setMileageAcknowledged(true);
              handleConfirm(true);
            }}
            disabled={submitting}
          >
            Log it anyway
          </button>
        )}
      </div>
    </div>
  );
}
