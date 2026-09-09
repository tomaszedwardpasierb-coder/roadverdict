// Place at: src/app/dashboard/LogCarModForm.tsx
//
// Car equivalent of LogModForm.tsx. CAR_MOD_LABELS is a flat ~19-key
// catalog (versus the motorcycle catalog's 250+, grouped, with its own
// search autocomplete) - a plain <select> is all this size needs, no
// ModSearchAutocomplete-equivalent required.
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';
import { AttachmentUploader } from './AttachmentUploader';
import { useEstimatedMileage } from './useEstimatedMileage';
import { CAR_MOD_LABELS } from '@/lib/tracker/carModTypes';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';

interface Props {
  initialMileage: number;
  mileageHistory: HistoryPoint[];
  startingMileage: number;
  dateAdded: string;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
  carYear?: number;
  isCustomBuild?: boolean;
}

export function LogCarModForm({ initialMileage, mileageHistory, startingMileage, dateAdded, distanceUnit, currency, rates, carYear, isCustomBuild }: Props) {
  const [category, setCategory] = useState(Object.keys(CAR_MOD_LABELS)[0]);
  const [name, setName] = useState('');
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
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-mods');

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);
  const mileageResult = checkMileageConsistency(Math.round(mileageInMiles), date, mileageHistory, initialMileage);
  // Deliberately no production-year gate here, same reasoning as
  // LogModForm.tsx - pre-purchase gear (bought for a previous car, then
  // fitted to this one) is legitimate, unlike a service or fuel receipt.
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({
      category,
      name,
      cost: costInGbp,
      mileage: Math.round(mileageInMiles),
      date,
      notes,
      attachments: attachment ? [attachment] : undefined,
      mileageAcknowledged,
    });
    if (ok) {
      setName('');
      setCostDisplay('');
      setNotes('');
      setMileageAcknowledged(false);
      setAttachment(null);
    }
  }

  const unitLabel = distanceUnitLabel(distanceUnit);

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a part or accessory</span>
        <div className="field">
          <label htmlFor="carmod-date">Date</label>
          <input id="carmod-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: carYear, isCustomBuild }) && (
            <p className="field-note" style={{ marginTop: '0.4rem' }}>
              This is dated before {carYear}, when this car was made - fine if it was bought for a previous car and fitted to this one.
            </p>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carmod-category">Category</label>
          <select id="carmod-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {Object.entries(CAR_MOD_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carmod-name">What is it?</label>
          <input id="carmod-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nextbase 622GW" required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carmod-cost">Cost paid ({CURRENCY_SYMBOLS[currency]})</label>
          <input id="carmod-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carmod-mileage">Mileage at the time ({unitLabel})</label>
          <input id="carmod-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => onMileageChange(e.target.value)} required />
          {estimateNote && <p className="field-note">{estimateNote}</p>}
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carmod-notes">Notes (optional)</label>
          <textarea id="carmod-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <div style={{ marginTop: '0.9rem' }}>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="carmod" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay) || 0, currency, rates), date }} />
        </div>
        <p className="field-note" style={{ marginTop: '0.9rem' }}>
          Some modifications can affect your insurance - worth checking with your insurer whether this needs declaring.
        </p>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting || isBlocked}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
