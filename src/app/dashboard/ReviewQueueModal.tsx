// Place at: src/app/dashboard/ReviewQueueModal.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { JOB_GROUPS, JOB_LABELS } from '@/lib/tracker/jobTypes';
import { BILL_LABELS } from '@/lib/tracker/billTypes';
import { MOD_LABELS } from '@/lib/tracker/modTypes';
import { AttachmentThumb } from './AttachmentThumb';
import { MileageConflictModal } from './MileageConflictModal';
import { checkFullTankPlausibility, checkLitresPlausibility } from '@/lib/tracker/fuelPlausibility';
import { classifyReceiptTier, isAutoCommitTier, receiptTierSortWeight } from '@/lib/tracker/receiptTiering';
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
  conflictPeer,
  onCorrectPeer,
  onDeletePeer,
}: {
  entry: ReviewQueueEntry;
  batchHints: { date: string; mileage: number }[];
  onSaved: (savedFields: Record<string, unknown>) => void;
  onSkip: () => void;
  onDeleteDuplicate: () => void;
  onPrev: () => void;
  onFinishLater: () => void;
  canGoPrev: boolean;
  finishing: boolean;
  mileageOptional: boolean;
  conflictPeer: ParsedReceiptItem | null;
  onCorrectPeer: (newMileage: number, newDate: string) => void;
  onDeletePeer: () => void;
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
    let savedFields: Record<string, unknown>;
    if (entry.category === 'service') {
      body = { jobType, cost: Number(cost), mileage: mileageValue, date, notes, batchHints };
      savedFields = { jobType, cost: Number(cost), mileage: mileageValue, date, notes };
    } else if (entry.category === 'fuel') {
      body = { litres: Number(litres), cost: Number(cost), mileage: mileageValue, date, filledToFull, batchHints };
      savedFields = { litres: Number(litres), cost: Number(cost), mileage: mileageValue, date, filledToFull };
    } else if (entry.category === 'mods') {
      body = { category: entry.modCategory, name, cost: Number(cost), mileage: mileageValue, date, notes, batchHints };
      // ReviewQueueEntry's own field is modCategory, not category -
      // category there is the discriminant ("mods") and must not be
      // overwritten with the sub-category string, unlike the PATCH
      // route's body, which genuinely does expect it under "category".
      savedFields = { modCategory: entry.modCategory, name, cost: Number(cost), mileage: mileageValue, date, notes };
    } else {
      body = { billType, cost: Number(cost), date, notes };
      savedFields = { billType, cost: Number(cost), date, notes };
    }

    const result = await patchEntry(entry, body);
    setSubmitting(false);
    if (result.ok) onSaved(savedFields);
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
            £{entry.duplicate.cost.toFixed(2)}.
          </p>
          <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={deleting || submitting}>
            {deleting ? 'Deleting…' : 'Delete this new entry'}
          </button>
        </div>
      )}

      {(entry.vehicleMismatch || entry.plateMismatch) && (
        <div className={styles.reviewQueueDuplicateWarning}>
          <p>
            {entry.vehicleMismatch && (
              <>
                This receipt looks like it&apos;s for a{' '}
                <strong>
                  {entry.vehicleMismatch.makeOnReceipt}
                  {entry.vehicleMismatch.modelOnReceipt ? ` ${entry.vehicleMismatch.modelOnReceipt}` : ''}
                </strong>
                {' '}- are you sure this belongs to this bike?
              </>
            )}
            {entry.vehicleMismatch && entry.plateMismatch && <br />}
            {entry.plateMismatch && (
              <>
                This receipt shows registration <strong>{entry.plateMismatch.registrationOnReceipt}</strong>, which isn&apos;t a plate this bike has ever used.
              </>
            )}
          </p>
          <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={deleting || submitting}>
            {deleting ? 'Deleting…' : 'Delete this entry'}
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
            <>
              <p className={styles.reviewQueueDuplicateWarning} style={{ marginBottom: "0.4rem" }}>
                {entry.mileageWarningText ??
                  "There is nothing nearby to estimate this from reliably - please enter the real mileage from the receipt, or your best own memory of it."}{" "}
                Once saved, this becomes a real anchor the next entries in this batch can use.
              </p>
              {((entry.mileageConflictReferenceId && entry.mileageConflictReferenceCategory) ||
                (entry.mileageConflictReferenceBatchIndex !== undefined && conflictPeer)) && (
                <button type="button" className={styles.iconBtn} onClick={() => setShowConflictModal(true)}>
                  Resolve
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
      {showConflictModal && entry.category !== "bills" &&
        ((entry.mileageConflictReferenceId && entry.mileageConflictReferenceCategory) ||
          (entry.mileageConflictReferenceBatchIndex !== undefined && conflictPeer)) && (
        <MileageConflictModal
          entryId={entry.id}
          entryCategory={entry.category as "service" | "fuel" | "mods"}
          entryDate={date}
          entryMileage={mileage.trim() ? Number(mileage) : entry.mileage}
          entryLabel={entry.aiDescription}
          entryAttachment={entry.attachment}
          referenceId={entry.mileageConflictReferenceId}
          referenceCategory={entry.mileageConflictReferenceCategory}
          isBatchPeerReference={entry.mileageConflictReferenceBatchIndex !== undefined}
          preloadedReference={
            entry.mileageConflictReferenceBatchIndex !== undefined && conflictPeer
              ? {
                  id: '',
                  category: (conflictPeer.category === 'bills' ? 'service' : conflictPeer.category) as 'service' | 'fuel' | 'mods',
                  date: conflictPeer.date,
                  mileage: conflictPeer.mileageOnReceipt ?? 0,
                  label: conflictPeer.description,
                  cost: conflictPeer.costGbp,
                  attachment: conflictPeer.attachment,
                }
              : undefined
          }
          onCorrectBatchPeer={onCorrectPeer}
          onDeleteBatchPeer={onDeletePeer}
          buildPatchBody={(overrides) => {
            const mv = overrides.mileage !== undefined ? overrides.mileage : mileage.trim() ? Number(mileage) : entry.mileage;
            const dt = overrides.date ?? date;
            const base =
              entry.category === "service" ? { jobType, cost: Number(cost), mileage: mv, date: dt, notes } :
              entry.category === "fuel" ? { litres: Number(litres), cost: Number(cost), mileage: mv, date: dt, filledToFull } :
              entry.category === "mods" ? { category: entry.modCategory, name, cost: Number(cost), mileage: mv, date: dt, notes } :
              { billType, cost: Number(cost), date: dt, notes };
            return {
              ...base,
              mileageAcknowledged: overrides.mileageAcknowledged,
              ...(overrides.mileageAnomaly !== undefined ? { mileageAnomaly: overrides.mileageAnomaly } : {}),
            };
          }}
          onResolved={() => {
            setShowConflictModal(false);
            onSaved({});
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
  if (entry.plateMismatch || entry.vehicleMismatch) return true;
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

// A clean auto-commit skips the human review step entirely, but the
// record it just created still has needsReview: true - that's the
// default every new record gets, and the ONLY thing that ever clears it
// is a real PATCH request, which a human clicking Save would normally
// send. Auto-commit never sends one, so without this, an auto-committed
// record would sit flagged as needing review forever - the exact
// opposite of what auto-commit is for. This re-saves the entry with its
// own already-confirmed values, unchanged, purely to trigger that flag
// clearing server-side.
async function markEntryReviewed(entry: ReviewQueueEntry): Promise<void> {
  let body: Record<string, unknown>;
  if (entry.category === 'service') {
    body = { jobType: entry.jobType, cost: entry.cost, mileage: entry.mileage, date: entry.date, notes: entry.notes, mileageAcknowledged: true };
  } else if (entry.category === 'fuel') {
    body = { litres: entry.litres, cost: entry.cost, mileage: entry.mileage, date: entry.date, filledToFull: entry.filledToFull, mileageAcknowledged: true };
  } else if (entry.category === 'mods') {
    body = { category: entry.modCategory, name: entry.name, cost: entry.cost, mileage: entry.mileage, date: entry.date, notes: entry.notes, mileageAcknowledged: true };
  } else {
    body = { billType: entry.billType, cost: entry.cost, date: entry.date, notes: entry.notes };
  }
  try {
    await fetch(`/api/tracker/${CATEGORY_ROUTE[entry.category]}/${encodeURIComponent(entry.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // Not fatal to the batch if this one follow-up call fails - the
    // record itself is already safely saved either way, this only
    // affects whether its review flag clears immediately or waits for
    // the owner to notice it later. Worth knowing about, not worth
    // blocking the scan over.
  }
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
    // Re-sorts with the exact same tier-then-date rule ScanReceiptButton.tsx
    // already applied before handing this batch over - not a second,
    // different rule. Re-applying it here (rather than trusting the prop's
    // order blindly) keeps this component correct on its own if it's ever
    // called with an unsorted batch, without risking the two disagreeing
    // the way an independent sort here previously did.
    [...parsedItems].sort((a, b) => {
      const tierDiff = receiptTierSortWeight(classifyReceiptTier(a)) - receiptTierSortWeight(classifyReceiptTier(b));
      if (tierDiff !== 0) return tierDiff;
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    })
  );
  const [committed, setCommitted] = useState<(ReviewQueueEntry | null)[]>(() => parsedItems.map(() => null));
  const [index, setIndex] = useState(0);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [finishing, setFinishing] = useState(false);
  // Set only when "Finish later" itself fails, partially or fully - see
  // handleFinishLater below. Deliberately separate from commitError
  // above, which is about a single item's normal one-at-a-time commit,
  // not the bulk fallback path.
  const [finishLaterError, setFinishLaterError] = useState<string | null>(null);
  const attemptedRef = useRef<Set<number>>(new Set());
  // Forces the auto-progress screen off for a specific index, for the
  // owner to escape manually - regardless of the underlying cause (a
  // request that never resolves or rejects, a silent server-side
  // failure, or anything else), this guarantees there's always a way
  // out that doesn't require refreshing the page. A stuck screen with
  // no way to intervene is worse than any individual failure mode it
  // might be covering for.
  const [forcedOutOfAuto, setForcedOutOfAuto] = useState<Set<number>>(new Set());

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
      .map((it, i) => ({ it, i }))
      .filter(({ i }) => i !== index)
      .filter(({ it }) => typeof it.mileageOnReceipt === "number")
      .map(({ it, i }) => ({
        date: it.date,
        mileage: it.mileageOnReceipt as number,
        batchIndex: i,
        // Only meaningful for fuel peers, and only ever read for that
        // category server-side - carried through so a fuel item's own
        // mileage estimate can use an earlier, still-unsaved batch
        // sibling as a real anchor point, the same way an already-saved
        // database record already could. Without this, two fuel
        // receipts uploaded in the very same batch couldn't help each
        // other at all, even when one had an exact printed reading the
        // other's estimate badly needed.
        category: it.category,
        litres: it.litres ?? undefined,
      }));

    // Already-committed peers from earlier in this same batch - unlike
    // batchHints above, these are included regardless of whether their
    // own mileage came from a printed reading or was itself an AI
    // estimate. That's deliberate: it's not reliable enough to compute
    // a RATE from (the server keeps that restriction), but it's still a
    // real, already-saved number nothing computed after it should be
    // allowed to silently contradict. This is what was missing before -
    // a peer reviewed and saved five items ago in this same batch is
    // exactly as real an anchor as one sitting in the database from a
    // previous session, and had no way to help at all until now.
    const boundsOnlyHints: { date: string; mileage: number; batchIndex: number }[] = [];
    committed.forEach((entry, i) => {
      if (i === index || !entry || entry.category === "bills") return;
      boundsOnlyHints.push({ date: entry.date, mileage: entry.mileage, batchIndex: i });
    });

    let cancelled = false;
    setCommitting(true);
    setCommitError(null);

    (async () => {
      try {
        const res = await fetch('/api/tracker/commit-receipt-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: items[index], batchHints, boundsOnlyHints }),
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
            void markEntryReviewed(data.entry);
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

  // Keeps the persisted batch in sync with what's actually still left
  // to review, every time committed changes - a single effect here
  // rather than a separate call at each individual commit site, so
  // nothing can commit an item through some path that forgets to sync
  // afterward. Skips the very first render (nothing's changed yet, no
  // point in a redundant write of exactly what ScanReceiptButton.tsx
  // already saved before this component even mounted).
  const isFirstCommittedRender = useRef(true);
  useEffect(() => {
    if (isFirstCommittedRender.current) {
      isFirstCommittedRender.current = false;
      return;
    }
    const remaining = items.filter((_, i) => committed[i] === null);
    void fetch('/api/tracker/pending-scan-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: remaining }),
    }).catch(() => {
      // Not fatal - the actual records are already safely committed
      // either way, this only affects whether an interrupted resume
      // would show a couple of already-done items again.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committed]);

  function goNext() {
    setIndex((i) => i + 1);
  }

  // A successful save only ever updated the database - committed[index]
  // itself was never touched, so the cached copy this component
  // actually renders from stayed frozen at whatever it looked like the
  // moment this item was first committed. Revisiting an already-saved
  // item showed the original unsaved state again, and any OTHER item
  // that had flagged a conflict against this one kept showing that
  // conflict forever, even once it was genuinely resolved. This updates
  // the entry that was just saved with its real new values, and clears
  // the stale conflict fields on every other item that had pointed at
  // this one - not a re-validation (nothing here re-checks whether a
  // new conflict now exists), just making sure nothing keeps displaying
  // a problem that's already been fixed.
  function handleEntrySaved(savedFields: Record<string, unknown>) {
    setCommitted((prev) => {
      const next = [...prev];
      const savedEntry = next[index];
      if (savedEntry) {
        const updated = { ...savedEntry, ...savedFields } as ReviewQueueEntry;
        if (updated.category !== 'bills') {
          updated.mileageNeedsManualEntry = false;
          updated.mileageWarningText = undefined;
          updated.mileageConflictReferenceId = undefined;
          updated.mileageConflictReferenceCategory = undefined;
          updated.mileageConflictReferenceBatchIndex = undefined;
        }
        updated.duplicate = null;
        next[index] = updated;
      }
      for (let i = 0; i < next.length; i++) {
        const other = next[i];
        if (i !== index && other && other.category !== 'bills' && other.mileageConflictReferenceBatchIndex === index) {
          next[i] = {
            ...other,
            mileageNeedsManualEntry: false,
            mileageWarningText: undefined,
            mileageConflictReferenceId: undefined,
            mileageConflictReferenceCategory: undefined,
            mileageConflictReferenceBatchIndex: undefined,
          };
        }
      }
      return next;
    });
    setIndex((i) => i + 1);
  }

  function handleDeleteDuplicate() {
    removeItemAtIndex(index);
  }

  // Shared by "delete this new entry" (duplicate detection) and
  // deleting a conflicting batch peer from the rich comparison modal -
  // removing an item from the middle of the array shifts every later
  // index, which would silently point any OTHER item's
  // mileageConflictReferenceBatchIndex at the wrong item (or, if it
  // pointed at exactly the removed one, at nothing at all). This keeps
  // every reference correct after the removal, not just the array
  // itself.
  function removeItemAtIndex(removedIndex: number) {
    attemptedRef.current.clear();
    setItems((prev) => prev.filter((_, i) => i !== removedIndex));
    setCommitted((prev) =>
      prev
        .filter((_, i) => i !== removedIndex)
        .map((entry) => {
          if (!entry || entry.category === 'bills' || entry.mileageConflictReferenceBatchIndex === undefined) return entry;
          if (entry.mileageConflictReferenceBatchIndex === removedIndex) {
            return { ...entry, mileageConflictReferenceBatchIndex: undefined };
          }
          if (entry.mileageConflictReferenceBatchIndex > removedIndex) {
            return { ...entry, mileageConflictReferenceBatchIndex: entry.mileageConflictReferenceBatchIndex - 1 };
          }
          return entry;
        })
    );
    setIndex((i) => (i > removedIndex ? i - 1 : i));
  }

  // Anything not yet reached is only sitting in browser memory as parsed
  // data, not a database record - closing without saving it would lose
  // it for good (the original photos aren't kept to re-scan). This
  // commits the remainder in one background pass before actually
  // closing, so nothing from this scan is ever silently lost, even if
  // it isn't individually reviewed.
  //
  // Critically, this only ever treats the commit as successful, deletes
  // the resumable batch, and closes the modal when the server actually
  // confirms every item saved. A response that arrives but reports an
  // error (or a partial failure - some items saved, some didn't) used
  // to fall through this same success path unchecked, silently deleting
  // the safety net and closing the modal as if nothing had gone wrong -
  // the exact "closes normally, receipts are just gone, no indication
  // anything failed" failure this whole feature exists to prevent.
  async function handleFinishLater() {
    const remaining = items.filter((_, i) => committed[i] === null);
    if (remaining.length === 0) {
      await fetch('/api/tracker/pending-scan-batch', { method: 'DELETE' }).catch(() => {});
      onFinished();
      return;
    }
    setFinishing(true);
    setFinishLaterError(null);

    let res: Response;
    try {
      res = await fetch('/api/tracker/commit-receipt-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: remaining }),
      });
    } catch {
      // A genuine network failure - nothing was sent, nothing was saved.
      // The pending batch already reflects `remaining` from the last
      // sync, so it's still fully resumable exactly as it was.
      setFinishing(false);
      setFinishLaterError("Couldn't reach the server. Your receipts are still safely waiting here - nothing's been lost. Try again.");
      return;
    }

    let data: {
      createdCount?: number;
      failedCount?: number;
      failedItems?: ParsedReceiptItem[];
      error?: string;
    } | null = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      // A hard server error - treat exactly like the network failure
      // above. The pending batch is untouched, so this is still fully
      // resumable.
      setFinishing(false);
      setFinishLaterError(data?.error ?? "Something went wrong saving these entries. Your receipts are still safely waiting here - nothing's been lost. Try again.");
      return;
    }

    if (data && (data.failedCount ?? 0) > 0 && data.failedItems) {
      // Partial success - some items genuinely saved, some didn't. Only
      // the ones that failed are still outstanding, so the local state
      // and the persisted batch both need to shrink down to exactly
      // those, rather than either losing track of the failures or
      // risking a retry resending items that already saved a moment
      // ago.
      const stillOutstanding = data.failedItems;
      await fetch('/api/tracker/pending-scan-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: stillOutstanding }),
      }).catch(() => {
        // Not fatal - the records that DID save are safely saved either
        // way. Worst case here is the resumable batch going briefly out
        // of sync with what's actually still outstanding.
      });
      setItems(stillOutstanding);
      setCommitted(stillOutstanding.map(() => null));
      attemptedRef.current.clear();
      setIndex(0);
      setFinishing(false);
      setFinishLaterError(
        `${data.createdCount ?? 0} of ${remaining.length} saved. ${data.failedCount} couldn't be saved and ${data.failedCount === 1 ? "is" : "are"} still waiting here below - try Finish later again, or review ${data.failedCount === 1 ? "it" : "them"} individually.`
      );
      return;
    }

    // Full success - only now is it actually safe to clear the
    // resumable batch and close.
    await fetch('/api/tracker/pending-scan-batch', { method: 'DELETE' }).catch(() => {});
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
  const currentIsAutoTier = !forcedOutOfAuto.has(index) && isAutoCommitTier(currentTier) && !(current && isDirty(current, items[index]));

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
            <button
              type="button"
              className={styles.iconBtn}
              style={{ marginTop: '0.8rem' }}
              onClick={() => setForcedOutOfAuto((prev) => new Set([...prev, index]))}
            >
              Taking a while - let me review this one myself
            </button>
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

        {finishLaterError && (
          <p className="error-text" role="alert" style={{ marginBottom: '0.6rem' }}>
            {finishLaterError}
          </p>
        )}

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
            {!commitError && (
              <button
                type="button"
                className={styles.iconBtn}
                style={{ marginTop: '0.8rem' }}
                onClick={() => {
                  attemptedRef.current.delete(index);
                  setRetryTick((t) => t + 1);
                }}
              >
                Taking a while - try again
              </button>
            )}
          </div>
        ) : (
          <QueueItemForm
            key={current.id}
            entry={current}
            mileageOptional={currentTier === 2}
            conflictPeer={current.category !== "bills" && current.mileageConflictReferenceBatchIndex !== undefined ? items[current.mileageConflictReferenceBatchIndex] ?? null : null}
            onCorrectPeer={(newMileage, newDate) => {
              if (current.category === "bills" || current.mileageConflictReferenceBatchIndex === undefined) return;
              const peerIndex = current.mileageConflictReferenceBatchIndex;
              setItems((prev) => prev.map((it, i) => (i === peerIndex ? { ...it, mileageOnReceipt: newMileage, date: newDate } : it)));
            }}
            onDeletePeer={() => {
              if (current.category === "bills" || current.mileageConflictReferenceBatchIndex === undefined) return;
              removeItemAtIndex(current.mileageConflictReferenceBatchIndex);
            }}
            batchHints={items
              .filter((_, i) => i !== index)
              .filter((it) => typeof it.mileageOnReceipt === 'number')
              .map((it) => ({ date: it.date, mileage: it.mileageOnReceipt as number }))}
            onSaved={handleEntrySaved}
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
