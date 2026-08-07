// Place at: src/app/dashboard/ReviewQueueModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { JOB_GROUPS, JOB_LABELS } from '@/lib/tracker/jobTypes';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import { MOD_LABELS } from '@/lib/tracker/modTypes';
import { AttachmentThumb } from './AttachmentThumb';
import { checkFullTankPlausibility, checkLitresPlausibility } from '@/lib/tracker/fuelPlausibility';
import type { ReviewQueueEntry } from '@/lib/tracker/commitReceiptItem';
import type { ParsedReceiptItem } from '@/lib/tracker/receiptParse';
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

async function patchEntry(entry: ReviewQueueEntry, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[entry.category]}/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => null);
    return { ok: false, error: data?.error };
  } catch {
    return { ok: false };
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
  batchHints,
  onSaved,
  onSkip,
  onDeleteDuplicate,
  onPrev,
  onFinishLater,
  canGoPrev,
  finishing,
}: {
  entry: ReviewQueueEntry;
  batchHints: { date: string; mileage: number }[];
  onSaved: () => void;
  onSkip: () => void;
  onDeleteDuplicate: () => void;
  onPrev: () => void;
  onFinishLater: () => void;
  canGoPrev: boolean;
  finishing: boolean;
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

  const liveFuelCheck =
    entry.category === 'fuel' && entry.precedingFuelMileage !== undefined && filledToFull && litres
      ? checkFullTankPlausibility(Number(litres) || 0, Number(mileage) || 0, [{ mileage: entry.precedingFuelMileage }])
      : null;
  const liveLitresCheck =
    entry.category === 'fuel' && litres ? checkLitresPlausibility(Number(litres) || 0, entry.tankCapacityLitres) : null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    let body: Record<string, unknown>;
    if (entry.category === 'service') {
      body = { jobType, cost: Number(cost), mileage: Number(mileage), date, notes, batchHints };
    } else if (entry.category === 'fuel') {
      body = { litres: Number(litres), cost: Number(cost), mileage: Number(mileage), date, filledToFull, batchHints };
    } else if (entry.category === 'mods') {
      body = { category: entry.modCategory, name, cost: Number(cost), mileage: Number(mileage), date, notes, batchHints };
    } else {
      body = { billType, cost: Number(cost), date, notes };
    }

    const result = await patchEntry(entry, body);
    setSubmitting(false);
    if (result.ok) onSaved();
    else setError(result.error ?? 'Could not save. Try again.');
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
        <AttachmentThumb attachment={entry.attachment} />
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
          {liveLitresCheck?.implausible && (
            <p className="field-note" style={{ marginTop: '0.3rem', color: 'var(--verdict-red)' }}>
              ⚠️ {liveLitresCheck.reason}
            </p>
          )}
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
              {entry.mileageWarningText ??
                "There's nothing nearby to estimate this from reliably - please enter the real mileage from the receipt, or your best own memory of it."}{' '}
              Once saved, this becomes a real anchor the next entries in this batch can use.
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
          {liveFuelCheck && (
            <p
              className="field-note"
              style={{ marginTop: '0.3rem', color: liveFuelCheck.plausible ? 'var(--verdict-green)' : 'var(--verdict-red)' }}
            >
              → works out to about <strong>{Math.round(liveFuelCheck.impliedMpg)} mpg</strong> for this tank
              {liveFuelCheck.plausible
                ? ' - looks reasonable.'
                : ` - still too low to be realistic (needs to be at least ${Math.round(liveFuelCheck.precedingMileage + liveFuelCheck.minPlausibleMiles).toLocaleString()}).`}
            </p>
          )}
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
        <button type="button" className={styles.iconBtn} onClick={onPrev} disabled={!canGoPrev || submitting || finishing}>
          ← Prev
        </button>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button type="button" className={styles.reviewQueueFinishLater} onClick={onFinishLater} disabled={submitting || finishing}>
            {finishing ? 'Saving the rest…' : 'Finish later'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={onSkip} disabled={submitting || finishing}>
            Skip
          </button>
          <button type="submit" className="submit-button" disabled={submitting || finishing}>
            {submitting ? 'Saving…' : 'Save and next'}
          </button>
        </div>
      </div>
    </form>
  );
}

// Commits one record at a time, right as the human reaches it - not the
// whole batch upfront. That's the whole point: a correction to item #1
// is a real, saved database row by the time item #2 is being estimated,
// so it genuinely becomes a better anchor for #2 rather than #2 having
// already been guessed from stale, pre-review context.
export function ReviewQueueModal({ parsedItems, onFinished }: { parsedItems: ParsedReceiptItem[]; onFinished: () => void }) {
  const [items, setItems] = useState(parsedItems);
  const [committed, setCommitted] = useState<(ReviewQueueEntry | null)[]>(() => parsedItems.map(() => null));
  const [index, setIndex] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const attemptedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (index >= items.length) return;
    if (committed[index] !== null) return;
    if (attemptedRef.current.has(index)) return;
    attemptedRef.current.add(index);

    // Every OTHER receipt in this same batch that has a mileage actually
    // printed on it - whether or not it's been reached yet. An exact
    // reading is trustworthy regardless of processing order, so item #90
    // can use item #95's printed mileage even before #95 is opened.
    const batchHints = items
      .filter((_, i) => i !== index)
      .filter((it) => typeof it.mileageOnReceipt === 'number')
      .map((it) => ({ date: it.date, mileage: it.mileageOnReceipt as number }));

    let cancelled = false;
    setCommitting(true);
    setCommitError(null);

    (async () => {
      try {
        const res = await fetch('/api/tracker/commit-receipt-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: items[index], batchHints }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.entry) {
          setCommitted((prev) => {
            const next = [...prev];
            next[index] = data.entry;
            return next;
          });
        } else {
          attemptedRef.current.delete(index);
          setCommitError(data.error ?? 'Could not save this entry.');
        }
      } catch {
        if (!cancelled) {
          attemptedRef.current.delete(index);
          setCommitError('Could not reach the server.');
        }
      } finally {
        if (!cancelled) setCommitting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, items.length, retryTick]);

  function goNext() {
    setIndex((i) => i + 1);
  }

  function handleDeleteDuplicate() {
    attemptedRef.current.clear();
    setItems((prev) => prev.filter((_, i) => i !== index));
    setCommitted((prev) => prev.filter((_, i) => i !== index));
  }

  // Anything not yet reached is only sitting in browser memory as parsed
  // data, not a database record - closing without saving it would lose
  // it for good (the original photos aren't kept to re-scan). This
  // commits the remainder in one background pass before actually
  // closing, so nothing from this scan is ever silently lost, even if
  // it isn't individually reviewed.
  async function handleFinishLater() {
    const remaining = items.filter((_, i) => committed[i] === null);
    if (remaining.length === 0) {
      onFinished();
      return;
    }
    setFinishing(true);
    try {
      await fetch('/api/tracker/commit-receipt-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: remaining }),
      });
    } catch {
      // Best-effort - if this fails, those items simply stay unscanned;
      // nothing already reviewed is at risk either way.
    }
    setFinishing(false);
    onFinished();
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

  const current = committed[index];

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

        {current === null ? (
          <div className={styles.reviewQueueDoneWrap}>
            {committing && <p className={styles.subtext}>Saving this entry…</p>}
            {commitError && (
              <>
                <p className="error-text" role="alert">{commitError}</p>
                <button type="button" className="submit-button" onClick={() => setRetryTick((t) => t + 1)}>
                  Retry
                </button>
              </>
            )}
          </div>
        ) : (
          <QueueItemForm
            key={current.id}
            entry={current}
            batchHints={items
              .filter((_, i) => i !== index)
              .filter((it) => typeof it.mileageOnReceipt === 'number')
              .map((it) => ({ date: it.date, mileage: it.mileageOnReceipt as number }))}
            onSaved={goNext}
            onSkip={goNext}
            onDeleteDuplicate={handleDeleteDuplicate}
            onPrev={() => setIndex((i) => Math.max(0, i - 1))}
            onFinishLater={handleFinishLater}
            canGoPrev={index > 0}
            finishing={finishing}
          />
        )}
      </div>
    </div>
  );
}
