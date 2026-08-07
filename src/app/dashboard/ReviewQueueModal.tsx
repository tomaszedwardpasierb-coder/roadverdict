// Place at: src/app/dashboard/ReviewQueueModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { JOB_GROUPS, JOB_LABELS } from '@/lib/tracker/jobTypes';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import { MOD_LABELS } from '@/lib/tracker/modTypes';
import { AttachmentThumb } from './AttachmentThumb';
import { MileageConflictModal } from './MileageConflictModal';
import { checkFullTankPlausibility, checkLitresPlausibility } from '@/lib/tracker/fuelPlausibility';
import { classifyReceiptTier, isAutoCommitTier } from '@/lib/tracker/receiptTiering';
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
  mileageOptional,
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
  mileageOptional: boolean;
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
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [findingConflict, setFindingConflict] = useState(false);
  const [conflictLookupError, setConflictLookupError] = useState<string | null>(null);

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

    // A blank mileage field only reaches here when it was optional in
    // the first place (a non-fuel receipt with no printed mileage) -
    // Number('') would otherwise silently submit 0, an actively harmful
    // value to write into the mileage timeline. Falling back to the
    // estimate the entry already carries is the correct "didn't bother
    // to re-type it" outcome, not a missing value.
    const mileageValue = mileage.trim() ? Number(mileage) : entry.category !== 'bills' ? entry.mileage : 0;

    let body: Record<string, unknown>;
    if (entry.category === 'service') {
      body = { jobType, cost: Number(cost), mileage: mileageValue, date, notes, batchHints };
    } else if (entry.category === 'fuel') {
      body = { litres: Number(litres), cost: Number(cost), mileage: mileageValue, date, filledToFull, batchHints };
    } else if (entry.category === 'mods') {
      body = { category: entry.modCategory, name, cost: Number(cost), mileage: mileageValue, date, notes, batchHints };
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
    <>
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
            Â£{entry.duplicate.cost.toFixed(2)}.
          </p>
          <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={deleting || submitting}>
            {deleting ? 'Deletingâ€¦' : 'Delete this new entry'}
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
              âš ï¸ {liveLitresCheck.reason}
            </p>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginTop: '0.7rem' }}>
        <div className="field">
          <label htmlFor="rq-cost">Cost (Â£)</label>
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
            <>
              <p className={styles.reviewQueueDuplicateWarning} style={{ marginBottom: "0.4rem" }}>
                {entry.mileageWarningText ??
                  "There is nothing nearby to estimate this from reliably - please enter the real mileage from the receipt, or your best own memory of it."}{" "}
                Once saved, this becomes a real anchor the next entries in this batch can use.
              </p>
              {entry.mileageConflictReferenceId && entry.mileageConflictReferenceCategory && (
                <button
                  type="button"
                  className={styles.iconBtn}
                  disabled={findingConflict}
                  onClick={async () => {
                    setFindingConflict(true);
                    setConflictLookupError(null);
                    try {
                      const res = await fetch(`/api/tracker/mileage-conflict-lookup?category=${entry.category}&id=${encodeURIComponent(entry.id)}`);
                      const data = await res.json();
                      if (res.ok) {
                        setShowConflictModal(true);
                      } else {
                        setConflictLookupError(data.error ?? "Could not find the conflicting entry.");
                      }
                    } catch {
                      setConflictLookupError("Could not reach the server.");
                    } finally {
                      setFindingConflict(false);
                    }
                  }}
                >
                  {findingConflict ? "Finding it..." : "Resolve"}
                </button>
              )}
              {conflictLookupError && <p className="error-text" role="alert">{conflictLookupError}</p>}
            </>
          )}
          <input
            id="rq-mileage"
            type="number"
            min="0"
            value={mileage}
            onChange={(e) => setMileage(e.target.value)}
            placeholder={entry.mileageNeedsManualEntry ? 'Enter the real mileage' : mileageOptional ? 'Optional' : undefined}
            required={!mileageOptional}
          />
          {liveFuelCheck && (
            <p
              className="field-note"
              style={{ marginTop: '0.3rem', color: liveFuelCheck.plausible ? 'var(--verdict-green)' : 'var(--verdict-red)' }}
            >
              â†’ works out to about <strong>{Math.round(liveFuelCheck.impliedMpg)} mpg</strong> for this tank
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
          â† Prev
        </button>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button type="button" className={styles.reviewQueueFinishLater} onClick={onFinishLater} disabled={submitting || finishing}>
            {finishing ? 'Saving the restâ€¦' : 'Finish later'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={onSkip} disabled={submitting || finishing}>
            Skip
          </button>
          <button type="submit" className="submit-button" disabled={submitting || finishing}>
            {submitting ? 'Savingâ€¦' : 'Save and next'}
          </button>
        </div>
      </div>
    </form>
      {showConflictModal && entry.category !== "bills" && entry.mileageConflictReferenceId && entry.mileageConflictReferenceCategory && (
        <MileageConflictModal
          entryId={entry.id}
          entryCategory={entry.category as "service" | "fuel" | "mods"}
          entryDate={date}
          entryMileage={mileage.trim() ? Number(mileage) : entry.mileage}
          entryLabel={entry.aiDescription}
          entryAttachment={entry.attachment}
          referenceId={entry.mileageConflictReferenceId}
          referenceCategory={entry.mileageConflictReferenceCategory}
          buildPatchBody={(overrides) => {
            const mv = mileage.trim() ? Number(mileage) : entry.mileage;
            const base =
              entry.category === "service" ? { jobType, cost: Number(cost), mileage: mv, date, notes } :
              entry.category === "fuel" ? { litres: Number(litres), cost: Number(cost), mileage: mv, date, filledToFull } :
              entry.category === "mods" ? { category: entry.modCategory, name, cost: Number(cost), mileage: mv, date, notes } :
              { billType, cost: Number(cost), date, notes };
            return {
              ...base,
              ...(overrides.mileage !== undefined ? { mileage: overrides.mileage } : {}),
              mileageAcknowledged: overrides.mileageAcknowledged,
              ...(overrides.mileageAnomaly !== undefined ? { mileageAnomaly: overrides.mileageAnomaly } : {}),
            };
          }}
          onResolved={() => {
            setShowConflictModal(false);
            onSaved();
          }}
          onClose={() => setShowConflictModal(false)}
        />
      )}
    </>
  );
}

// Commits one record at a time, right as the human reaches it - not the
// whole batch upfront. That's the whole point: a correction to item #1
// is a real, saved database row by the time item #2 is being estimated,
// so it genuinely becomes a better anchor for #2 rather than #2 having
// already been guessed from stale, pre-review context.

// A tier-1/4 item (printed date and mileage) only actually skips human
// review if the commit came back completely clean - a duplicate, a
// currency conversion that couldn't complete, or (for fuel specifically)
// a printed mileage that conflicts with the rest of the timeline all
// still need a human's eyes regardless of how strong the anchor looked
// on paper. mileageNeedsManualEntry doesn't exist on the bills variant
// at all, since bills never need mileage estimation - checking the
// category first, rather than a blind property access, keeps this safe
// across the whole union.
function isDirty(entry: ReviewQueueEntry, original: ParsedReceiptItem): boolean {
  if (entry.duplicate) return true;
  if (original.forceReview) return true;
  if (entry.category !== 'bills' && entry.mileageNeedsManualEntry) return true;
  // commitReceiptItem doesn't reject on implausible litres the way the
  // manual write routes do - it only ever surfaces as a live warning in
  // this same queue. Without this check, a tier-4 item (fuel, printed
  // mileage) with an OCR-misread litres figure would auto-commit
  // silently, since nothing else about it looks wrong.
  if (entry.category === 'fuel' && checkLitresPlausibility(entry.litres, entry.tankCapacityLitres).implausible) return true;
  return false;
}

// "Prev" should always land on something there's actually a reason to
// look at - stepping back exactly one index could land on an
// already-auto-committed, clean item, which would show the "logging
// automatically" message again for something that finished a moment
// ago. Skips backward past any contiguous run of those instead.
function findPrevInteractiveIndex(items: ParsedReceiptItem[], committed: (ReviewQueueEntry | null)[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    const tier = classifyReceiptTier(items[i]);
    const entry = committed[i];
    if (!isAutoCommitTier(tier) || (entry && isDirty(entry, items[i]))) return i;
  }
  return 0;
}

export function ReviewQueueModal({ parsedItems, onFinished }: { parsedItems: ParsedReceiptItem[]; onFinished: () => void }) {
  const [items, setItems] = useState(() =>
    [...parsedItems].sort((a, b) => {
      const aHasMileage = typeof a.mileageOnReceipt === "number";
      const bHasMileage = typeof b.mileageOnReceipt === "number";
      if (aHasMileage && bHasMileage) return (a.mileageOnReceipt as number) - (b.mileageOnReceipt as number);
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
  );
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
          // A clean auto-commit-tier item (printed date and mileage,
          // nothing wrong with it) never needs a human step at all -
          // move straight to the next item instead of waiting for a
          // Save/Skip click that would just be clicking through data
          // that was never actually in question.
          const tier = classifyReceiptTier(items[index]);
          if (isAutoCommitTier(tier) && !isDirty(data.entry, items[index])) {
            setIndex((i) => i + 1);
          }
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

  // Auto-commit tier, still clean (or not yet known to be dirty because
  // the commit hasn't returned yet) - show a simple progress indicator
  // instead of the filmstrip and form. This branch is checked explicitly
  // rather than relying on the setCommitted+setIndex calls in the effect
  // landing in the same React batch, so the human is never shown a
  // review step for an item that's about to be skipped a moment later
  // regardless of timing.
  const currentTier = classifyReceiptTier(items[index]);
  const currentIsAutoTier = isAutoCommitTier(currentTier) && !(current && isDirty(current, items[index]));

  if (currentIsAutoTier) {
    const autoTierTotal = items.filter((it) => isAutoCommitTier(classifyReceiptTier(it))).length;
    const autoTierDoneCount = items.slice(0, index).filter((it) => isAutoCommitTier(classifyReceiptTier(it))).length;
    return (
      <div className={styles.reviewQueueOverlay}>
        <div className={styles.reviewQueueModal}>
          <div className={styles.reviewQueueDoneWrap}>
            <p className={styles.reviewQueueDoneTitle}>Logging clear entries automatically</p>
            <p className={styles.subtext}>
              These already have a date and mileage confirmed, so there&apos;s nothing to review, {autoTierDoneCount} of {autoTierTotal} so far.
            </p>
            {commitError && (
              <>
                <p className="error-text" role="alert">{commitError}</p>
                <button type="button" className="submit-button" onClick={() => setRetryTick((t) => t + 1)}>
                  Retry
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

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
            {committing && <p className={styles.subtext}>Saving this entryâ€¦</p>}
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
            mileageOptional={currentTier === 2}
            batchHints={items
              .filter((_, i) => i !== index)
              .filter((it) => typeof it.mileageOnReceipt === 'number')
              .map((it) => ({ date: it.date, mileage: it.mileageOnReceipt as number }))}
            onSaved={goNext}
            onSkip={goNext}
            onDeleteDuplicate={handleDeleteDuplicate}
            onPrev={() => setIndex((i) => findPrevInteractiveIndex(items, committed, i))}
            onFinishLater={handleFinishLater}
            canGoPrev={index > 0}
            finishing={finishing}
          />
        )}
      </div>
    </div>
  );
}
