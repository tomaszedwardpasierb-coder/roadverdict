// Place at: src/app/dashboard/MileageConflictModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { AttachmentThumb } from './AttachmentThumb';
import { pointsConflict } from '@/lib/tracker/mileageCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './dashboard.module.css';

const CATEGORY_ROUTE: Record<string, string> = { service: 'services', fuel: 'fuel', mods: 'mods' };
const CATEGORY_LABEL: Record<string, string> = { service: 'Service', fuel: 'Fuel', mods: 'Parts & Accessories' };

interface ReferenceEntry {
  id: string;
  category: 'service' | 'fuel' | 'mods';
  date: string;
  mileage: number;
  label: string;
  cost: number;
  attachment: Attachment | null;
  // Category-specific fields, real values from the record - needed so
  // correcting this entry's mileage doesn't overwrite everything else
  // with a placeholder, since the PATCH routes require a complete body.
  jobType?: string;
  notes?: string;
  litres?: number;
  filledToFull?: boolean;
  modCategory?: string;
  name?: string;
}

interface Props {
  entryId: string;
  entryCategory: 'service' | 'fuel' | 'mods';
  entryDate: string;
  entryMileage: number;
  entryLabel: string;
  entryAttachment?: Attachment;
  referenceId?: string;
  referenceCategory?: 'service' | 'fuel' | 'mods';
  preloadedReference?: ReferenceEntry;
  // True when the reference is another item still sitting in this same
  // batch, not yet saved anywhere - it has a description and a receipt
  // photo to show, but no real database id to PATCH or DELETE. Correct
  // and Delete still work in this case, just against the batch's own
  // in-memory item instead of the server.
  isBatchPeerReference?: boolean;
  onCorrectBatchPeer?: (newMileage: number, newDate: string) => void;
  onDeleteBatchPeer?: () => void;
  // Each card knows its OWN record's full shape (a service record needs
  // jobType/notes, fuel needs litres/filledToFull, mods needs
  // name/modCategory) - the PATCH routes require the complete field
  // set, not a partial patch, so only the caller can safely build a
  // body that won't be rejected as incomplete. This function takes
  // just the override(s) this modal actually decided on, and returns
  // the caller's own complete, valid body.
  buildPatchBody: (overrides: { mileage?: number; date?: string; mileageAnomaly?: boolean; mileageAcknowledged?: boolean }) => Record<string, unknown>;
  onResolved: () => void;
  onClose: () => void;
}

export function MileageConflictModal({
  entryId,
  entryCategory,
  entryDate,
  entryMileage,
  entryLabel,
  entryAttachment,
  referenceId,
  preloadedReference,
  referenceCategory,
  isBatchPeerReference,
  onCorrectBatchPeer,
  onDeleteBatchPeer,
  buildPatchBody,
  onResolved,
  onClose,
}: Props) {
  const [reference, setReference] = useState<ReferenceEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'choose' | 'correctBoth'>('choose');
  const [newMileageForEntry, setNewMileageForEntry] = useState(String(entryMileage));
  const [newDateForEntry, setNewDateForEntry] = useState(entryDate);
  const [newMileageForReference, setNewMileageForReference] = useState('');
  const [newDateForReference, setNewDateForReference] = useState('');

  useEffect(() => {
    if (preloadedReference) {
      setReference(preloadedReference);
      setNewMileageForReference(String(preloadedReference.mileage));
      setNewDateForReference(preloadedReference.date);
      setLoading(false);
      return;
    }
    if (!referenceId || !referenceCategory) {
      setError("No reference entry to compare against.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tracker/conflict-reference?category=${referenceCategory}&id=${encodeURIComponent(referenceId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setReference(data);
          setNewMileageForReference(String(data.mileage));
          setNewDateForReference(data.date);
        } else {
          setError(data.error ?? "Could not load the other entry.");
        }
      } catch {
        if (!cancelled) setError("Could not reach the server.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preloadedReference, referenceId, referenceCategory]);

  async function patchThisEntry(overrides: { mileage?: number; date?: string; mileageAnomaly?: boolean; mileageAcknowledged?: boolean }): Promise<boolean> {
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[entryCategory]}/${encodeURIComponent(entryId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPatchBody(overrides)),
    });
    return res.ok;
  }

  // The reference entry didn't come from this card, so there's no
  // caller-supplied builder for it - reconstruct its own complete body
  // from what conflict-reference returned, using the record's own real
  // values (now included in the response) rather than a placeholder
  // that would silently overwrite them.
  async function patchReferenceEntry(ref: ReferenceEntry, mileage: number, date: string): Promise<boolean> {
    let body: Record<string, unknown>;
    if (ref.category === 'service') body = { jobType: ref.jobType, cost: ref.cost, mileage, date, notes: ref.notes, mileageAcknowledged: true };
    else if (ref.category === 'fuel') body = { litres: ref.litres, cost: ref.cost, mileage, date, filledToFull: ref.filledToFull, mileageAcknowledged: true };
    else body = { category: ref.modCategory, name: ref.name, cost: ref.cost, mileage, date, notes: ref.notes, mileageAcknowledged: true };
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[ref.category]}/${encodeURIComponent(ref.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return res.ok;
  }

  async function deleteEntry(category: string, id: string): Promise<boolean> {
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[category]}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return res.ok;
  }

  async function handleIgnore() {
    setSubmitting(true);
    setError(null);
    const ok = await patchThisEntry({ mileageAcknowledged: true, mileageAnomaly: true });
    setSubmitting(false);
    if (ok) onResolved();
    else setError('Could not save. Try again.');
  }

  // For when the two entries turn out not to actually conflict any more
  // (the mileage that caused this was corrected elsewhere, but the
  // warning text on this record was never cleared) - re-saves this
  // entry exactly as it is, purely to clear the stale warning, without
  // marking it a genuine anomaly the way "Keep both" does.
  async function handleClearStaleWarning() {
    setSubmitting(true);
    setError(null);
    const ok = await patchThisEntry({ mileageAcknowledged: true });
    setSubmitting(false);
    if (ok) onResolved();
    else setError('Could not save. Try again.');
  }

  async function handleCorrectBoth() {
    setSubmitting(true);
    setError(null);
    const entryMileageChanged = Number(newMileageForEntry) !== entryMileage;
    const entryDateChanged = newDateForEntry !== entryDate;
    const refMileageChanged = reference && Number(newMileageForReference) !== reference.mileage;
    const refDateChanged = reference && newDateForReference !== reference.date;

    const tasks: Promise<boolean>[] = [];
    if (entryMileageChanged || entryDateChanged) {
      tasks.push(patchThisEntry({ mileage: Number(newMileageForEntry), date: newDateForEntry, mileageAcknowledged: true }));
    }
    if ((refMileageChanged || refDateChanged) && reference) {
      if (isBatchPeerReference && onCorrectBatchPeer) {
        // Synchronous, client-side only - this item hasn't been saved
        // anywhere yet, so there's nothing to PATCH. The correction
        // just updates the batch's own copy, which is what the queue
        // will actually commit once it's reached.
        onCorrectBatchPeer(Number(newMileageForReference), newDateForReference);
      } else {
        tasks.push(patchReferenceEntry(reference, Number(newMileageForReference), newDateForReference));
      }
    }
    const results = await Promise.all(tasks);
    setSubmitting(false);
    if (results.every(Boolean)) onResolved();
    else setError('Could not save one or both corrections. Try again.');
  }

  async function handleDelete(which: 'entry' | 'reference' | 'both') {
    setSubmitting(true);
    setError(null);
    const tasks: Promise<boolean>[] = [];
    if (which === 'entry' || which === 'both') tasks.push(deleteEntry(entryCategory, entryId));
    if ((which === 'reference' || which === 'both') && reference) {
      if (isBatchPeerReference && onDeleteBatchPeer) {
        onDeleteBatchPeer();
      } else {
        tasks.push(deleteEntry(reference.category, reference.id));
      }
    }
    const results = await Promise.all(tasks);
    setSubmitting(false);
    if (results.every(Boolean)) onResolved();
    else setError('Could not delete. Try again.');
  }

  const entryIsEarlier = reference ? new Date(entryDate).getTime() < new Date(reference.date).getTime() : null;
  // Re-validated here rather than trusted from whatever produced
  // referenceId/preloadedReference - that value can go stale (e.g. the
  // reference's own mileage got corrected elsewhere after the warning
  // was first set, but nothing re-checks old warnings when that
  // happens), and this modal is the last line of defence against
  // presenting a "conflict" that the numbers, right here, don't
  // actually support.
  const stillConflicting = reference ? pointsConflict(entryMileage, entryDate, reference.mileage, reference.date) : null;

  return (
    <div className={styles.reviewQueueOverlay}>
      <div className={styles.reviewQueueModal} style={{ maxWidth: '640px' }}>
        <p className={styles.reviewQueueDoneTitle} style={{ marginBottom: '0.3rem' }}>
          {stillConflicting === false ? 'No conflict found' : 'Mileage conflict'}
        </p>
        <p className="field-note" style={{ marginBottom: '1rem' }}>
          {stillConflicting === false
            ? "These two entries don't actually disagree any more - whatever caused this must have already been corrected elsewhere, but the warning on this entry was never cleared."
            : "These two entries don't agree on the timeline - one shows a higher mileage at an earlier date than the other."}
        </p>

        {loading ? (
          <p className={styles.subtext}>Loading the other entry…</p>
        ) : !reference ? (
          <p className="error-text" role="alert">{error ?? 'Could not load the other entry.'}</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem' }}>
                <div className="field-note" style={{ marginBottom: '0.4rem', fontWeight: 600 }}>
                  {entryIsEarlier ? 'EARLIER' : 'LATER'} · This entry
                </div>
                {entryAttachment ? <AttachmentThumb attachment={entryAttachment} /> : <p className="field-note">No receipt attached to this one.</p>}
                <p style={{ margin: '0.5rem 0 0.2rem', fontWeight: 600 }}>{entryLabel}</p>
                <p className="field-note">{new Date(entryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p style={{ margin: '0.3rem 0 0' }}>
                  <strong>{entryMileage.toLocaleString()} mi</strong>
                </p>
              </div>
              <div style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '0.8rem' }}>
                <div className="field-note" style={{ marginBottom: '0.4rem', fontWeight: 600 }}>
                  {!entryIsEarlier ? 'EARLIER' : 'LATER'} · {CATEGORY_LABEL[reference.category]}
                </div>
                {reference.attachment ? <AttachmentThumb attachment={reference.attachment} /> : <p className="field-note">No receipt attached to this one.</p>}
                <p style={{ margin: '0.5rem 0 0.2rem', fontWeight: 600 }}>{reference.label}</p>
                <p className="field-note">{new Date(reference.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                <p style={{ margin: '0.3rem 0 0' }}>
                  <strong>{reference.mileage.toLocaleString()} mi</strong>
                </p>
              </div>
            </div>

            {error && (
              <p className="error-text" role="alert" style={{ marginBottom: '0.8rem' }}>
                {error}
              </p>
            )}

            {mode === 'choose' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {stillConflicting === false ? (
                  <>
                    <button type="button" className="submit-button" disabled={submitting} onClick={handleClearStaleWarning}>
                      {submitting ? 'Clearing…' : 'Clear this warning'}
                    </button>
                    <button type="button" className={styles.iconBtn} disabled={submitting} onClick={onClose}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="submit-button" disabled={submitting} onClick={handleIgnore}>
                      Keep both as they are - mark as a known anomaly (shown as a separate dot on the mileage chart, excluded from the trend line)
                    </button>
                    <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => setMode('correctBoth')}>
                      Correct the mileage on one or both entries
                    </button>
                    <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => handleDelete('entry')}>
                      Delete this entry ({entryLabel})
                    </button>
                    <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => handleDelete('reference')}>
                      Delete the other entry ({reference.label})
                    </button>
                    <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => handleDelete('both')}>
                      Delete both entries
                    </button>
                    <button type="button" className={styles.iconBtn} disabled={submitting} onClick={onClose}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginBottom: '0.8rem' }}>
                  <div className="field">
                    <label htmlFor="cf-entry-mileage">This entry&apos;s mileage</label>
                    <input id="cf-entry-mileage" type="number" min="0" value={newMileageForEntry} onChange={(e) => setNewMileageForEntry(e.target.value)} />
                    <label htmlFor="cf-entry-date" style={{ marginTop: '0.5rem', display: 'block' }}>This entry&apos;s date</label>
                    <input id="cf-entry-date" type="date" value={newDateForEntry} onChange={(e) => setNewDateForEntry(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cf-ref-mileage">{CATEGORY_LABEL[reference.category]}&apos;s mileage</label>
                    <input id="cf-ref-mileage" type="number" min="0" value={newMileageForReference} onChange={(e) => setNewMileageForReference(e.target.value)} />
                    <label htmlFor="cf-ref-date" style={{ marginTop: '0.5rem', display: 'block' }}>{CATEGORY_LABEL[reference.category]}&apos;s date</label>
                    <input id="cf-ref-date" type="date" value={newDateForReference} onChange={(e) => setNewDateForReference(e.target.value)} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem' }}>
                  <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => setMode('choose')}>
                    Back
                  </button>
                  <button type="button" className="submit-button" disabled={submitting} onClick={handleCorrectBoth}>
                    {submitting ? 'Saving…' : 'Save both'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
