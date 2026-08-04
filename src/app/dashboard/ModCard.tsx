// Place at: src/app/dashboard/ModCard.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { MOD_GROUPS, MOD_LABELS, MOD_LABEL_TO_KEY, findGroupForCategory } from '@/lib/tracker/modTypes';
import type { ModDoc } from '@/lib/tracker/mod';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { AttachmentUploader } from './AttachmentUploader';
import { AttachmentThumb } from './AttachmentThumb';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import { formatDistance, convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTabSwitch, goToNextReview, type ReviewCategory } from './TabSwitchContext';
import { mileageConfidenceLabel } from '@/lib/tracker/mileageEstimate';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ModCard({
  mod,
  distanceUnit,
  currency,
  rates,
  pendingReviewIds,
}: {
  mod: ModDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  pendingReviewIds: Record<ReviewCategory, string[]>;
}) {
  const { switchTo, focusId, setFocusId, highlightIds } = useTabSwitch();
  const [isEditing, setIsEditing] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [group, setGroup] = useState(() => findGroupForCategory(mod.category));
  const [category, setCategory] = useState(mod.category);
  const [categorySearch, setCategorySearch] = useState('');
  const [name, setName] = useState(mod.name);
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(mod.cost, currency, rates).toFixed(2)
  );
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(mod.mileage, distanceUnit)))
  );
  const [date, setDate] = useState(mod.date);
  const [notes, setNotes] = useState(mod.notes);
  const [attachment, setAttachment] = useState<Attachment | null>(mod.attachments?.[0] ?? null);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/mods/${encodeURIComponent(mod.id)}`);

  useEffect(() => {
    if (focusId === mod.id) {
      setIsEditing(true);
      setFocusId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  useEffect(() => {
    if (!highlightIds.includes(mod.id)) return;
    setIsHighlighted(true);
    if (highlightIds[0] === mod.id) {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    const timer = setTimeout(() => setIsHighlighted(false), 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  function handleGroupChange(newGroup: string) {
    setGroup(newGroup);
    const groupData = MOD_GROUPS.find((g) => g.group === newGroup);
    setCategory(groupData?.subgroups[0]?.mods[0] ?? '');
  }

  function handleCategorySearch(value: string) {
    setCategorySearch(value);
    const matchedKey = MOD_LABEL_TO_KEY[value];
    if (matchedKey) {
      setCategory(matchedKey);
      setGroup(findGroupForCategory(matchedKey));
    }
  }

  const selectedGroupData = MOD_GROUPS.find((g) => g.group === group);

  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const mileageInMiles = Math.round(convertDisplayToMiles(Number(mileageDisplay), distanceUnit));
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ category, name, cost: costInGbp, mileage: mileageInMiles, date, notes, attachments: attachment ? [attachment] : [] }, 'PATCH');
    if (ok) {
      setIsEditing(false);
      if (mod.needsReview) goToNextReview(pendingReviewIds, 'mods', mod.id, switchTo, setFocusId);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this modification? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-mod-date-${mod.id}`}>Date</label>
            <input id={`edit-mod-date-${mod.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-search-${mod.id}`}>Search for an item</label>
            <input
              id={`edit-mod-search-${mod.id}`}
              type="text"
              list={`edit-mod-catalog-datalist-${mod.id}`}
              value={categorySearch}
              onChange={(e) => handleCategorySearch(e.target.value)}
              placeholder="e.g. chain guide, tank bag, disc lock..."
            />
            <datalist id={`edit-mod-catalog-datalist-${mod.id}`}>
              {Object.keys(MOD_LABEL_TO_KEY).map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-group-${mod.id}`}>Group</label>
            <select id={`edit-mod-group-${mod.id}`} value={group} onChange={(e) => handleGroupChange(e.target.value)}>
              {MOD_GROUPS.map((g) => (
                <option key={g.group} value={g.group}>{g.group}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-category-${mod.id}`}>Category</label>
            <select id={`edit-mod-category-${mod.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
              {selectedGroupData?.subgroups.map((sg) => (
                <optgroup key={sg.subcategory} label={sg.subcategory}>
                  {sg.mods.map((m) => (
                    <option key={m} value={m}>{MOD_LABELS[m]}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-name-${mod.id}`}>What is it?</label>
            <input id={`edit-mod-name-${mod.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-cost-${mod.id}`}>Cost ({symbol})</label>
            <input id={`edit-mod-cost-${mod.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-mileage-${mod.id}`}>Mileage ({unitLabel})</label>
            <input id={`edit-mod-mileage-${mod.id}`} type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-notes-${mod.id}`}>Notes</label>
            <textarea id={`edit-mod-notes-${mod.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix={`-mod-${mod.id}`} compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting}>
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
      className={`${styles.jobCard} ${mod.needsReview ? styles.jobCardNeedsReview : ''} ${isHighlighted ? styles.cardHighlight : ''}`}
    >
      {mod.needsReview && (
        <div className={styles.needsReviewNote}>
          🧠 Auto-created from a scanned receipt - click Edit to review, especially the mileage, before it's done.
          {mod.aiDescription && <div className={styles.aiDescriptionNote}>{mod.aiDescription}</div>}
        </div>
      )}
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{mod.name}</span>
        <span className={styles.jobCardCost}>{formatCurrency(mod.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {MOD_LABELS[mod.category]} · {fmtDate(mod.date)} · {formatDistance(mod.mileage, distanceUnit)}
        {mod.mileageConfidence && (
          <span className={mod.mileageConfidence === 'confirmed' ? styles.mileageConfirmedTag : styles.mileageConfidenceTag}>
            {mileageConfidenceLabel(mod.mileageConfidence)}
          </span>
        )}
      </div>
      {mod.currencyConversion && (
        <div className={styles.currencyConversionNote}>
          Originally {mod.currencyConversion.originalAmount.toFixed(2)} {mod.currencyConversion.originalCurrency},
          converted at the {fmtDate(mod.currencyConversion.ratedAt)} rate.
        </div>
      )}
      {mod.notes && <div className={styles.jobCardNotes}>{mod.notes}</div>}
      {mod.attachments?.[0] && <AttachmentThumb attachment={mod.attachments[0]} />}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
