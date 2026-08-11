// Place at: src/app/dashboard/FuelLogCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import type { FuelLogDoc } from '@/lib/tracker/fuelLog';
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

export function FuelLogCard({
  log,
  distanceUnit,
  currency,
  rates,
  pendingReviewIds,
  mileageHistory,
  currentMileage,
}: {
  log: FuelLogDoc;
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
  const [conflictReference, setConflictReference] = useState<{ id: string; category: "service" | "fuel" | "mods" } | null>(null);
  const [findingConflict, setFindingConflict] = useState(false);
  const [conflictLookupError, setConflictLookupError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [litres, setLitres] = useState(String(log.litres));
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(log.cost, currency, rates).toFixed(2)
  );
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(log.mileage, distanceUnit)))
  );
  const [date, setDate] = useState(log.date);
  const [filledToFull, setFilledToFull] = useState(log.filledToFull);
  const [attachment, setAttachment] = useState<Attachment | null>(log.attachments?.[0] ?? null);
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const mileageInMilesForCheck = Math.round(convertDisplayToMiles(Number(mileageDisplay), distanceUnit));
  const mileageResult = checkMileageConsistency(mileageInMilesForCheck, date, mileageHistory, currentMileage);
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);
  const { submit, submitting, error } = useTrackerFormSubmit(
    `/api/tracker/fuel/${encodeURIComponent(log.id)}`
  );

  useEffect(() => {
    if (focusId === log.id) {
      setIsEditing(true);
      setFocusId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!highlightIds.includes(log.id)) return;
    setIsHighlighted(true);
    if (highlightIds[0] === log.id) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setIsHighlighted(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  const perLitreGbp = log.cost / log.litres;
  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit(
      { litres: Number(litres), cost: costInGbp, mileage: mileageInMilesForCheck, date, filledToFull, attachments: attachment ? [attachment] : [], mileageAcknowledged },
      'PATCH'
    );
    if (ok) {
      setIsEditing(false);
      if (log.needsReview) goToNextReview(pendingReviewIds, 'fuel', log.id, switchTo, setFocusId);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this fuel entry? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-fuel-date-${log.id}`}>Date</label>
            <input id={`edit-fuel-date-${log.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-fuel-litres-${log.id}`}>Litres</label>
            <input id={`edit-fuel-litres-${log.id}`} type="number" min="0" step="0.01" value={litres} onChange={(e) => setLitres(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-fuel-cost-${log.id}`}>Cost paid ({symbol})</label>
            <input id={`edit-fuel-cost-${log.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-fuel-mileage-${log.id}`}>Mileage ({unitLabel})</label>
            <input id={`edit-fuel-mileage-${log.id}`} type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
            <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
          </div>
          <div className="field-checkbox">
            <label>
              <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} />
              Filled the tank completely full
            </label>
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-fuel-${log.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
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
      className={`${styles.jobCard} ${log.needsReview ? styles.jobCardNeedsReview : ''} ${isHighlighted ? styles.cardHighlight : ''}`}
    >
      {log.needsReview && (
        <div className={styles.needsReviewNote}>
          {log.mileageConflictWarning ? (
            <>⚠️ {log.mileageConflictWarning}
            <button
              type="button"
              className={styles.iconBtn}
              disabled={findingConflict}
              onClick={async () => {
                setFindingConflict(true);
                setConflictLookupError(null);
                try {
                  const res = await fetch(`/api/tracker/mileage-conflict-lookup?category=fuel&id=${encodeURIComponent(log.id)}`);
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
          {log.aiDescription && <div className={styles.aiDescriptionNote}>{log.aiDescription}</div>}
        </div>
      )}
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{log.litres.toFixed(1)} L{log.filledToFull ? ' (full tank)' : ''}</span>
        <span className={styles.jobCardCost}>{formatCurrency(log.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {fmtDate(log.date)} · {formatDistance(log.mileage, distanceUnit)} · {symbol}{convertGbpToDisplay(perLitreGbp, currency, rates).toFixed(2)}/litre
        {log.mileageConfidence && (
          <span className={log.mileageConfidence === 'confirmed' ? styles.mileageConfirmedTag : styles.mileageConfidenceTag}>
            {mileageConfidenceLabel(log.mileageConfidence)}
          </span>
        )}
      </div>
      {log.currencyConversion && (
        <div className={styles.currencyConversionNote}>
          Originally {log.currencyConversion.originalAmount.toFixed(2)} {log.currencyConversion.originalCurrency},
          converted at the {fmtDate(log.currencyConversion.ratedAt)} rate.
        </div>
      )}
      {log.attachments?.[0] && <AttachmentThumb attachment={log.attachments[0]} />}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {showConflictModal && conflictReference && (
        <MileageConflictModal
          entryId={log.id}
          entryCategory="fuel"
          entryDate={log.date}
          entryMileage={log.mileage}
          entryLabel={`${log.litres.toFixed(1)}L fill-up`}
          entryAttachment={log.attachments?.[0]}
          referenceId={conflictReference.id}
          referenceCategory={conflictReference.category}
          buildPatchBody={(overrides) => ({
            litres: log.litres,
            cost: log.cost,
            mileage: overrides.mileage ?? log.mileage,
            date: log.date,
            filledToFull: log.filledToFull,
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
