// Place at: src/app/dashboard/LabourCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { LABOUR_GROUPS, LABOUR_LABELS, LABOUR_LABEL_TO_KEY } from '@/lib/tracker/labourTypes';
import type { LabourDoc } from '@/lib/tracker/labour';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { formatDistance, convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTabSwitch, goToNextReview, type ReviewCategory } from './TabSwitchContext';
import { mileageConfidenceLabel } from '@/lib/tracker/mileageEstimate';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { MileageWarning } from './MileageWarning';
import { MileageConflictModal } from './MileageConflictModal';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function LabourCard({
  labour,
  distanceUnit,
  currency,
  rates,
  pendingReviewIds,
  mileageHistory,
  currentMileage,
}: {
  labour: LabourDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  pendingReviewIds: Record<ReviewCategory, string[]>;
  mileageHistory: HistoryPoint[];
  currentMileage: number;
}) {
  const { switchTo, focusId, setFocusId, highlightIds } = useTabSwitch();
  const [isEditing, setIsEditing] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [conflictReference, setConflictReference] = useState<{ id: string; category: "service" | "fuel" | "mods" | "mot" | "labour" } | null>(null);
  const [findingConflict, setFindingConflict] = useState(false);
  const [conflictLookupError, setConflictLookupError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [category, setCategory] = useState(labour.category);
  const [categorySearch, setCategorySearch] = useState('');
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(labour.cost, currency, rates).toFixed(2)
  );
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(labour.mileage, distanceUnit)))
  );
  const [date, setDate] = useState(labour.date);
  const [notes, setNotes] = useState(labour.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(labour.attachments?.[0] ?? null);
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const mileageInMilesForCheck = Math.round(convertDisplayToMiles(Number(mileageDisplay), distanceUnit));
  const mileageResult = checkMileageConsistency(mileageInMilesForCheck, date, mileageHistory, currentMileage);
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/labour/${encodeURIComponent(labour.id)}`);

  useEffect(() => {
    if (focusId === labour.id) {
      setIsEditing(true);
      setFocusId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!highlightIds.includes(labour.id)) return;
    setIsHighlighted(true);
    if (highlightIds[0] === labour.id) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setIsHighlighted(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  function handleCategorySearch(value: string) {
    setCategorySearch(value);
    const matchedKey = LABOUR_LABEL_TO_KEY[value];
    if (matchedKey) setCategory(matchedKey);
  }

  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ category, cost: costInGbp, mileage: mileageInMilesForCheck, date, notes, attachments: attachment ? [attachment] : [], mileageAcknowledged }, 'PATCH');
    if (ok) {
      setIsEditing(false);
      if (labour.needsReview) goToNextReview(pendingReviewIds, 'labour', labour.id, switchTo, setFocusId);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this labour entry? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-labour-date-${labour.id}`}>Date</label>
            <input id={`edit-labour-date-${labour.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-labour-search-${labour.id}`}>Search for a labour job</label>
            <input
              id={`edit-labour-search-${labour.id}`}
              type="text"
              list={`edit-labour-catalog-datalist-${labour.id}`}
              value={categorySearch}
              onChange={(e) => handleCategorySearch(e.target.value)}
              placeholder="e.g. brake bleed, valve clearance, wheel bearing..."
            />
            <datalist id={`edit-labour-catalog-datalist-${labour.id}`}>
              {Object.keys(LABOUR_LABEL_TO_KEY).map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-labour-category-${labour.id}`}>Category</label>
            <select id={`edit-labour-category-${labour.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {LABOUR_GROUPS.map((g) => (
                <optgroup key={g.group} label={g.group}>
                  {g.jobs.map((j) => (
                    <option key={j} value={j}>{LABOUR_LABELS[j]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-labour-cost-${labour.id}`}>Cost ({symbol})</label>
            <input id={`edit-labour-cost-${labour.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-labour-mileage-${labour.id}`}>Mileage ({unitLabel})</label>
            <input id={`edit-labour-mileage-${labour.id}`} type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
            <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-labour-notes-${labour.id}`}>Notes</label>
            <textarea id={`edit-labour-notes-${labour.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-labour-${labour.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
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
      className={`${styles.jobCard} ${labour.needsReview ? styles.jobCardNeedsReview : ''} ${isHighlighted ? styles.cardHighlight : ''}`}
    >
      {labour.needsReview && (
        <div className={styles.needsReviewNote}>
          {labour.mileageConflictWarning ? (
            <>⚠️ {labour.mileageConflictWarning}
            <button
              type="button"
              className={styles.iconBtn}
              disabled={findingConflict}
              onClick={async () => {
                setFindingConflict(true);
                setConflictLookupError(null);
                try {
                  const res = await fetch(`/api/tracker/mileage-conflict-lookup?category=labour&id=${encodeURIComponent(labour.id)}`);
                  const data = await res.json();
                  if (res.ok) {
                    setConflictReference({ id: data.referenceId, category: data.referenceCategory });
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
            {conflictLookupError && <p className="error-text" role="alert">{conflictLookupError}</p>}
            </>
          ) : (
            <>🧠 Auto-created from a scanned receipt - click Edit to review, especially the mileage, before it&apos;s done.</>
          )}
          {labour.aiDescription && <div className={styles.aiDescriptionNote}>{labour.aiDescription}</div>}
        </div>
      )}
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{LABOUR_LABELS[labour.category] ?? labour.category}</span>
        <span className={styles.jobCardCost}>{formatCurrency(labour.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(labour.date)} · {formatDistance(labour.mileage, distanceUnit)}
        {labour.mileageConfidence && (
          <span className={labour.mileageConfidence === 'confirmed' ? styles.mileageConfirmedTag : styles.mileageConfidenceTag}>
            {mileageConfidenceLabel(labour.mileageConfidence)}
          </span>
        )}
      </div>
      {labour.currencyConversion && (
        <div className={styles.currencyConversionNote}>
          Originally {labour.currencyConversion.originalAmount.toFixed(2)} {labour.currencyConversion.originalCurrency},
          converted at the {fmtDate(labour.currencyConversion.ratedAt)} rate.
        </div>
      )}
      {labour.notes && <div className={styles.jobCardNotes}>{labour.notes}</div>}
      {labour.attachments?.[0] && <AttachmentThumb attachment={labour.attachments[0]} />}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {showConflictModal && conflictReference && (
        <MileageConflictModal
          entryId={labour.id}
          entryCategory="labour"
          entryDate={labour.date}
          entryMileage={labour.mileage}
          entryLabel={LABOUR_LABELS[labour.category] ?? labour.category}
          entryAttachment={labour.attachments?.[0]}
          referenceId={conflictReference.id}
          referenceCategory={conflictReference.category}
          buildPatchBody={(overrides) => ({
            category: labour.category,
            cost: labour.cost,
            mileage: overrides.mileage ?? labour.mileage,
            date: labour.date,
            notes: labour.notes,
            mileageAcknowledged: overrides.mileageAcknowledged,
            ...(overrides.mileageAnomaly !== undefined ? { mileageAnomaly: overrides.mileageAnomaly } : {}),
          })}
          onResolved={() => {
            setShowConflictModal(false);
            window.location.reload();
          }}
          onClose={() => setShowConflictModal(false)}
        />
      )}
    </div>
  );
}
