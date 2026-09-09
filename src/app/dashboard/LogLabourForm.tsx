// Place at: src/app/dashboard/LogLabourForm.tsx
'use client';

import { useState, useMemo } from 'react';
import { LABOUR_GROUPS, LABOUR_LABELS, LABOUR_LABEL_TO_KEY } from '@/lib/tracker/labourTypes';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';
import { AttachmentUploader } from './AttachmentUploader';
import { LabourSearchAutocomplete } from './LabourSearchAutocomplete';
import { useEstimatedMileage } from './useEstimatedMileage';
import { isBackdated, backdateNotice } from '@/lib/tracker/backdateCheck';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './dashboard.module.css';

export function LogLabourForm({
  initialMileage,
  mileageHistory,
  startingMileage,
  dateAdded,
  distanceUnit,
  currency,
  rates,
  bikeYear,
  isCustomBuild,
}: {
  initialMileage: number;
  mileageHistory: HistoryPoint[];
  startingMileage: number;
  dateAdded: string;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  bikeYear?: number;
  isCustomBuild?: boolean;
}) {
  const [category, setCategory] = useState(LABOUR_GROUPS[0].jobs[0]);
  const [categorySearch, setCategorySearch] = useState('');
  const [costDisplay, setCostDisplay] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { mileageDisplay, onMileageChange, estimateNote } = useEstimatedMileage({
    date,
    mileageHistory,
    startingMileage,
    currentMileage: initialMileage,
    dateAdded,
    distanceUnit,
  });
  const [notes, setNotes] = useState('');
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/labour');

  // Called only when a suggestion is actually clicked (typing itself is
  // handled separately) - jumps the category select straight to that
  // item. Unlike Mods, there's no separate "group" state to keep in
  // sync: LABOUR_GROUPS is single-level, so the <select> below already
  // lists every group's jobs at once via <optgroup>.
  function handleCategorySearch(label: string) {
    setCategorySearch(label);
    const matchedKey = LABOUR_LABEL_TO_KEY[label];
    if (matchedKey) setCategory(matchedKey);
  }

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);

  const mileageResult = useMemo(
    () => checkMileageConsistency(mileageInMiles, date, mileageHistory, initialMileage),
    [mileageInMiles, date, mileageHistory, initialMileage]
  );
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ category, cost: costInGbp, mileage: Math.round(mileageInMiles), date, notes, attachments: attachment ? [attachment] : undefined, mileageAcknowledged });
    if (ok) {
      setCostDisplay('');
      setNotes('');
      setMileageAcknowledged(false);
      setAttachment(null);
    }
  }

  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log labour</span>
        <div className="field">
          <label htmlFor="labour-date">Date</label>
          <input id="labour-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: bikeYear, isCustomBuild }) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              This date is before {bikeYear}, when this bike was made - double-check the date.
            </p>
          )}
          {date && isBackdated(date, new Date().toISOString()) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              {backdateNotice(date, new Date().toISOString())} - this will be flagged in your buyer report
              (softened if you attach a receipt) to help build trust in your history, not hide it.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="labour-category-search">Search for a labour job</label>
          <LabourSearchAutocomplete
            id="labour-category-search"
            value={categorySearch}
            onChange={setCategorySearch}
            onSelect={handleCategorySearch}
            placeholder="e.g. brake bleed, valve clearance, wheel bearing..."
          />
          <div className="field-note">Not sure which category it&apos;s under? Start typing here instead.</div>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="labour-category">Category</label>
          <select id="labour-category" value={category} onChange={(e) => setCategory(e.target.value)}>
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
          <label htmlFor="labour-cost">Cost ({symbol})</label>
          <input id="labour-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="labour-mileage">Mileage at the time ({unitLabel})</label>
          <input id="labour-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => onMileageChange(e.target.value)} required />
          {estimateNote && <p className="field-note">{estimateNote}</p>}
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="labour-notes">Notes (optional)</label>
          <textarea id="labour-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. workshop labour rate, time spent" />
        </div>
        <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="-labour" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className={styles.scanReceiptBtn} type="submit" disabled={submitting || isBlocked}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
