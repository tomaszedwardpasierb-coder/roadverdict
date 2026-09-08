// Place at: src/app/dashboard/LogCarLabourForm.tsx
//
// Car equivalent of LogLabourForm.tsx. Unlike every other car form (see
// LogCarServiceForm.tsx's own note - CAR_JOB_LABELS is a small flat
// catalog with no grouping needed), the car labour catalog is
// deliberately as deep as the motorcycle one (see carLabourTypes.ts),
// so this form keeps the full grouped-select + free-text search
// treatment rather than the simplified pattern every other car form uses.
'use client';

import { useState, useMemo } from 'react';
import { CAR_LABOUR_GROUPS, CAR_LABOUR_LABELS, CAR_LABOUR_LABEL_TO_KEY } from '@/lib/tracker/carLabourTypes';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';
import { AttachmentUploader } from './AttachmentUploader';
import { CarLabourSearchAutocomplete } from './CarLabourSearchAutocomplete';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './dashboard.module.css';

export function LogCarLabourForm({
  initialMileage,
  mileageHistory,
  distanceUnit,
  currency,
  rates,
  carYear,
  isCustomBuild,
}: {
  initialMileage: number;
  mileageHistory: HistoryPoint[];
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  carYear?: number;
  isCustomBuild?: boolean;
}) {
  const [category, setCategory] = useState(CAR_LABOUR_GROUPS[0].jobs[0]);
  const [categorySearch, setCategorySearch] = useState('');
  const [costDisplay, setCostDisplay] = useState('');
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(initialMileage, distanceUnit)))
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-labour');

  function handleCategorySearch(label: string) {
    setCategorySearch(label);
    const matchedKey = CAR_LABOUR_LABEL_TO_KEY[label];
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
          <label htmlFor="car-labour-date">Date</label>
          <input id="car-labour-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: carYear, isCustomBuild }) && (
            <p className="field-note" style={{ color: 'var(--amber-ink)' }}>
              This date is before {carYear}, when this car was made - double-check the date.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-labour-category-search">Search for a labour job</label>
          <CarLabourSearchAutocomplete
            id="car-labour-category-search"
            value={categorySearch}
            onChange={setCategorySearch}
            onSelect={handleCategorySearch}
            placeholder="e.g. brake bleed, timing belt, EV battery health check..."
          />
          <div className="field-note">Not sure which category it&apos;s under? Start typing here instead.</div>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-labour-category">Category</label>
          <select id="car-labour-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CAR_LABOUR_GROUPS.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.jobs.map((j) => (
                  <option key={j} value={j}>{CAR_LABOUR_LABELS[j]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-labour-cost">Cost ({symbol})</label>
          <input id="car-labour-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-labour-mileage">Mileage at the time ({unitLabel})</label>
          <input id="car-labour-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-labour-notes">Notes (optional)</label>
          <textarea id="car-labour-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. workshop labour rate, time spent" />
        </div>
        <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="-car-labour" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay), currency, rates), date }} />
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
