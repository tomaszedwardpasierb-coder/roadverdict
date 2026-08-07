// Place at: src/app/dashboard/MileageConflictModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { AttachmentThumb } from './AttachmentThumb';
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
}

interface Props {
  entryId: string;
  entryCategory: 'service' | 'fuel' | 'mods';
  entryDate: string;
  entryMileage: number;
  entryLabel: string;
  entryAttachment?: Attachment;
  referenceId: string;
  referenceCategory: 'service' | 'fuel' | 'mods';
  // Each card knows its OWN record's full shape (a service record needs
  // jobType/notes, fuel needs litres/filledToFull, mods needs
  // name/modCategory) - the PATCH routes require the complete field
  // set, not a partial patch, so only the caller can safely build a
  // body that won't be rejected as incomplete. This function takes
  // just the override(s) this modal actually decided on, and returns
  // the caller's own complete, valid body.
  buildPatchBody: (overrides: { mileage?: number; mileageAnomaly?: boolean; mileageAcknowledged?: boolean }) => Record<string, unknown>;
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
  referenceCategory,
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
  const [newMileageForReference, setNewMileageForReference] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tracker/conflict-reference?category=${referenceCategory}&id=${encodeURIComponent(referenceId)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setReference(data);
          setNewMileageForReference(String(data.mileage));
        } else {
          setError(data.error ?? 'Could not load the other entry.');
        }
      } catch {
        if (!cancelled) setError('Could not reach the server.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [referenceId, referenceCategory]);

  async function patchThisEntry(overrides: { mileage?: number; mileageAnomaly?: boolean; mileageAcknowledged?: boolean }): Promise<boolean> {
    const res = await fetch(`/api/tracker/${CATEGORY_ROUTE[entryCategory]}/${encodeURIComponent(entryId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPatchBody(overrides)),
    });
    return res.ok;
  }

  // The reference entry didn't come from this card, so there's no
  // caller-supplied builder for it - reconstruct its own complete body
  // from what conflict-reference already returned. Category-specific
  // required fields it doesn't otherwise have (jobType, litres, name)
  // fall back to values the respective PATCH route will accept as a
  // genuine, honest placeholder - "other" / 0 / "Unnamed" - rather than
  // guessing at a specific answer.
  async function patchReferenceEntry(ref: ReferenceEntry, mileage: number): Promise<boolean> {
    let body: Record<string, unknown>;
    if (ref.category === 'service') body = { jobType: 'other', cost: ref.cost, mileage, date: ref.date, notes: ref.label, mileageAcknowledged: true };
    else if (ref.category === 'fuel') body = { litres: 0, cost: ref.cost, mileage, date: ref.date, filledToFull: true, mileageAcknowledged: true };
    else body = { category: 'other-accessory', name: ref.label, cost: ref.cost, mileage, date: ref.date, notes: '', mileageAcknowledged: true };
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

  async function handleCorrectBoth() {
    setSubmitting(true);
    setError(null);
    const entryChanged = Number(newMileageForEntry) !== entryMileage;
    const refChanged = reference && Number(newMileageForReference) !== reference.mileage;
    const results = await Promise.all([
      entryChanged ? patchThisEntry({ mileage: Number(newMileageForEntry), mileageAcknowledged: true }) : Promise.resolve(true),
      refChanged && reference ? patchReferenceEntry(reference, Number(newMileageForReference)) : Promise.resolve(true),
    ]);
    setSubmitting(false);
    if (results.every(Boolean)) onResolved();
    else setError('Could not save one or both corrections. Try again.');
  }

  async function handleDelete(which: 'entry' | 'reference' | 'both') {
    setSubmitting(true);
    setError(null);
    const tasks: Promise<boolean>[] = [];
    if (which === 'entry' || which === 'both') tasks.push(deleteEntry(entryCategory, entryId));
    if ((which === 'reference' || which === 'both') && reference) tasks.push(deleteEntry(reference.category, reference.id));
    const results = await Promise.all(tasks);
    setSubmitting(false);
    if (results.every(Boolean)) onResolved();
    else setError('Could not delete. Try again.');
  }

  const entryIsEarlier = reference ? new Date(entryDate).getTime() < new Date(reference.date).getTime() : null;

  return (
    <div className={styles.reviewQueueOverlay}>
      <div className={styles.reviewQueueModal} style={{ maxWidth: '640px' }}>
        <p className={styles.reviewQueueDoneTitle} style={{ marginBottom: '0.3rem' }}>Mileage conflict</p>
        <p className="field-note" style={{ marginBottom: '1rem' }}>
          These two entries don&apos;t agree on the timeline - one shows a higher mileage at an earlier date than the other.
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
                <button type="button" className="submit-button" disabled={submitting} onClick={handleIgnore}>
                  Keep both as they are - mark as a known anomaly (shown as a separate dot on the mileage chart, excluded from the trend line)
                </button>
                <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => setMode('correctBoth')}>
                  Correct the mileage on one or both entries
                </button>
                <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => handleDelete('entry')}>
                  Delete this entry
                </button>
                <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => handleDelete('reference')}>
                  Delete the other entry
                </button>
                <button type="button" className={styles.iconBtn} disabled={submitting} onClick={() => handleDelete('both')}>
                  Delete both entries
                </button>
                <button type="button" className={styles.iconBtn} disabled={submitting} onClick={onClose}>
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem', marginBottom: '0.8rem' }}>
                  <div className="field">
                    <label htmlFor="cf-entry-mileage">This entry&apos;s mileage</label>
                    <input id="cf-entry-mileage" type="number" min="0" value={newMileageForEntry} onChange={(e) => setNewMileageForEntry(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="cf-ref-mileage">{CATEGORY_LABEL[reference.category]}&apos;s mileage</label>
                    <input id="cf-ref-mileage" type="number" min="0" value={newMileageForReference} onChange={(e) => setNewMileageForReference(e.target.value)} />
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
