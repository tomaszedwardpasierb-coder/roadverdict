// Place at: src/app/dashboard/ReviewQueueModal.tsx
'use client';

import { useState } from 'react';
import { JOB_GROUPS, JOB_LABELS } from '@/lib/tracker/jobTypes';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import { MOD_LABELS } from '@/lib/tracker/modTypes';
import type { ReviewQueueEntry } from '@/app/api/tracker/commit-receipt-items/route';
import styles from './dashboard.module.css';

const CATEGORY_ROUTE: Record<ReviewQueueEntry['category'], string> = {
  service: 'services',
  fuel: 'fuel',
  mods: 'mods',
  bills: 'bills',
};

const CATEGORY_LABEL: Record<ReviewQueueEntry['category'], string> = {
  service: 'Service',
  fuel: 'Fuel',
  mods: 'Parts & Accessories',
  bills: 'Tax & Insurance',
};

async function patchEntry(entry: ReviewQueueEntry, body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[entry.category]}/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteEntry(entry: ReviewQueueEntry): Promise<boolean> {
  try {
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[entry.category]}/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}

// Deliberately does NOT send `attachments` in any PATCH body - the quick
// queue never offers changing the receipt photo, and omitting the key
// entirely leaves updateTrackerDoc's merge untouched, which preserves the
// attachment set at creation rather than risking clearing it.
function QueueItemForm({
  entry,
  onSaved,
  onSkip,
  onDeleteDuplicate,
  onPrev,
  onFinishLater,
  canGoPrev,
}: {
  entry: ReviewQueueEntry;
  onSaved: () => void;
  onSkip: () => void;
  onDeleteDuplicate: () => void;
  onPrev: () => void;
  onFinishLater: () => void;
  canGoPrev: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cost, setCost] = useState(entry.cost.toFixed(2));
  const [date, setDate] = useState(entry.date);
  const [mileage, setMileage] = useState(
    entry.category !== 'bills' && !entry.mileageNeedsManualEntry ? String(entry.mileage) : ''
  );
  const [notes, setNotes] = useState(entry.category === 'bills' || entry.category === 'service' || entry.category === 'mods' ? entry.notes : '');
  const [jobType, setJobType] = useState(entry.category === 'service' ? entry.jobType : '');
  const [litres, setLitres] = useState(entry.category === 'fuel' ? String(entry.litres) : '');
  const [filledToFull, setFilledToFull] = useState(entry.category === 'fuel' ? entry.filledToFull : true);
  const [name, setName] = useState(entry.category === 'mods' ? entry.name : '');
  const [billType, setBillType] = useState(entry.category === 'bills' ? entry.billType : '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let body: Record<string, unknown>;
    if (entry.category === 'service') {
      body = { jobType, cost: Number(cost), mileage: Number(mileage), date, notes };
    } else if (entry.category === 'fuel') {
      body = { litres: Number(litres), cost: Number(cost), mileage: Number(mileage), date, filledToFull };
    } else if (entry.category === 'mods') {
      body = { category: entry.modCategory, name, cost: Number(cost), mileage: Number(mileage), date, notes };
    } else {
      body = { billType, cost: Number(cost), date, notes };
    }

    const ok = await patchEntry(entry, body);
    setSubmitting(false);
    if (ok) onSaved();
    else setError('Could not save. Try again.');
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    const ok = await deleteEntry(entry);
    setDeleting(false);
    if (ok) onDeleteDuplicate();
    else setError('Could not delete. Try again.');
  }

  return (
    <form onSubmit={handleSave}>
      <div className={styles.reviewQueueReceipt}>
        <div className={styles.reviewQueueThumb} aria-hidden="true">🧾</div>
        <div>
          <span className={styles.reviewQueueCategoryBadge}>{CATEGORY_LABEL[entry.category]}</span>
          <p className={styles.reviewQueueAiDescription}>{entry.aiDescription}</p>
        </div>
      </div>

      {entry.duplicate && (
        <div className={styles.reviewQueueDuplicateWarning}>
          <p>
            This might already be logged: <strong>{entry.duplicate.description}</strong>,{' '}
            {new Date(entry.duplicate.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })},{' '}
            £{entry.duplicate.cost.toFixed(2)}.
          </p>
          <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={deleting || submitting}>
            {deleting ? 'Deleting…' : 'Delete this new entry'}
          </button>
        </div>
      )}

      {entry.category === 'service' && (
        <div className="field">
          <label htmlFor="rq-job">Job</label>
          <select id="rq-job" value={jobType} onChange={(e) => setJobType(e.target.value)}>
            {JOB_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{JOB_LABELS[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'mods' && (
        <div className="field">
          <label htmlFor="rq-name">What is it?</label>
          <input id="rq-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          <p className="field-note">{MOD_LABELS[entry.modCategory] ?? entry.modCategory} - change the specific category from Edit on the card if needed.</p>
        </div>
      )}

      {entry.category === 'bills' && (
        <div className="field">
          <label htmlFor="rq-billtype">Type</label>
          <select id="rq-billtype" value={billType} onChange={(e) => setBillType(e.target.value)}>
            {Object.entries(BILL_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}

      {entry.category === 'fuel' && (
        <div className="field">
          <label htmlFor="rq-litres">Litres</label>
          <input id="rq-litres" type="number" min="0" step="0.01" value={litres} onChange={(e) => setLitres(e.target.value)} required />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginTop: '0.7rem' }}>
        <div className="field">
          <label htmlFor="rq-cost">Cost (£)</label>
          <input id="rq-cost" type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="rq-date">Date</label>
          <input id="rq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
      </div>

      {entry.category !== 'bills' && (
        <div className="field" style={{ marginTop: '0.7rem' }}>
          <label htmlFor="rq-mileage">Mileage</label>
          {entry.mileageNeedsManualEntry && (
            <p className={styles.reviewQueueDuplicateWarning} style={{ marginBottom: '0.4rem' }}>
              There&apos;s nothing nearby to estimate this from reliably - please enter the real mileage from the
              receipt, or your best own memory of it.
            </p>
          )}
          <input
            id="rq-mileage"
            type="number"
            min="0"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder={entry.mileageNeedsManualEntry ? 'Enter the real mileage' : undefined}
            required
          />
        </div>
      )}

      {entry.category === 'fuel' && (
        <div className="field-checkbox">
          <label>
            <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} />
            Filled the tank completely full
          </label>
        </div>
      )}

      {entry.category !== 'fuel' && (
        <div className="field" style={{ marginTop: '0.7rem' }}>
          <label htmlFor="rq-notes">Notes</label>
          <textarea id="rq-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      )}

      {error && <p className="error-text" role="alert">{error}</p>}

      <div className={styles.reviewQueueFooterRow}>
        <button type="button" className={styles.iconBtn} onClick={onPrev} disabled={!canGoPrev || submitting}>
          ← Prev
        </button>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button type="button" className={styles.reviewQueueFinishLater} onClick={onFinishLater} disabled={submitting}>
            Finish later
          </button>
          <button type="button" className={styles.iconBtn} onClick={onSkip} disabled={submitting}>
            Skip
          </button>
          <button type="submit" className="submit-button" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save and next'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function ReviewQueueModal({ entries, onFinished }: { entries: ReviewQueueEntry[]; onFinished: () => void }) {
  const [items, setItems] = useState(entries);
  const [index, setIndex] = useState(0);

  function goNext() {
    setIndex((i) => i + 1);
  }

  function handleDeleteDuplicate() {
    // Deliberately does not touch `index` - the array shifts left, so
    // whatever was next is now sitting at this same index already.
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  if (items.length === 0 || index >= items.length) {
    const reviewedCount = items.length;
    return (
      <div className={styles.reviewQueueOverlay}>
        <div className={styles.reviewQueueModal}>
          <div className={styles.reviewQueueDoneWrap}>
            <p className={styles.reviewQueueDoneTitle}>All caught up</p>
            <p className={styles.subtext}>
              {reviewedCount === 0 ? 'Nothing left to review from this scan.' : `${reviewedCount} ${reviewedCount === 1 ? 'entry' : 'entries'} added from this scan.`}
            </p>
            <button type="button" className="submit-button" onClick={onFinished}>Done</button>
          </div>
        </div>
      </div>
    );
  }

  const current = items[index];

  return (
    <div className={styles.reviewQueueOverlay}>
      <div className={styles.reviewQueueModal}>
        <div className={styles.reviewQueueFilmstrip}>
          {items.map((_, i) => (
            <div
              key={i}
              className={`${styles.reviewQueueFilmstripItem} ${i < index ? styles.reviewQueueFilmstripDone : i === index ? styles.reviewQueueFilmstripActive : ''}`}
            />
          ))}
        </div>
        <div className={styles.reviewQueueProgress}>
          <span>Reviewing {index + 1} of {items.length}</span>
          <span className="field-note">{Math.round(((index + 1) / items.length) * 100)}%</span>
        </div>
        <QueueItemForm
          key={current.id}
          entry={current}
          onSaved={goNext}
          onSkip={goNext}
          onDeleteDuplicate={handleDeleteDuplicate}
          onPrev={() => setIndex((i) => Math.max(0, i - 1))}
          onFinishLater={onFinished}
          canGoPrev={index > 0}
        />
      </div>
    </div>
  );
}
