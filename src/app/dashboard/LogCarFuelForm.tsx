// Place at: src/app/dashboard/LogCarFuelForm.tsx
//
// Car equivalent of LogFuelForm.tsx, with one real branch the
// motorcycle version doesn't need: litres for anything with an engine,
// kWh (with no "filled to full" concept) for electric. Which field
// shows is driven by the active car's own fuelType, passed in as a prop
// rather than re-fetched here.
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';
import { AttachmentUploader } from './AttachmentUploader';
import { useEstimatedMileage } from './useEstimatedMileage';
import { isBeforeProduction } from '@/lib/tracker/productionYearCheck';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import type { Attachment } from '@/lib/tracker/cosmosHelpers';

type CarFuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric';

interface Props {
  fuelType: CarFuelType;
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

export function LogCarFuelForm({ fuelType, initialMileage, mileageHistory, startingMileage, dateAdded, distanceUnit, currency, rates, carYear, isCustomBuild }: Props) {
  const isElectric = fuelType === 'electric';
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [litres, setLitres] = useState('');
  const [kwh, setKwh] = useState('');
  const [costDisplay, setCostDisplay] = useState('');
  const { mileageDisplay, onMileageChange, estimateNote } = useEstimatedMileage({
    date,
    mileageHistory,
    startingMileage,
    currentMileage: initialMileage,
    dateAdded,
    distanceUnit,
  });
  const [filledToFull, setFilledToFull] = useState(true);
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car-fuel');

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);
  const mileageResult = checkMileageConsistency(Math.round(mileageInMiles), date, mileageHistory, initialMileage);
  const isBlocked = mileageResult.status === 'blocked'
    || (mileageResult.status === 'warning' && !mileageAcknowledged)
    || Boolean(date && isBeforeProduction(date, { year: carYear, isCustomBuild }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({
      litres: isElectric ? undefined : Number(litres),
      kwh: isElectric ? Number(kwh) : undefined,
      cost: costInGbp,
      mileage: Math.round(mileageInMiles),
      date,
      filledToFull: isElectric ? undefined : filledToFull,
      attachments: attachment ? [attachment] : undefined,
      mileageAcknowledged,
    });
    if (ok) {
      setLitres('');
      setKwh('');
      setCostDisplay('');
      setMileageAcknowledged(false);
      setAttachment(null);
    }
  }

  const unitLabel = distanceUnitLabel(distanceUnit);

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a {isElectric ? 'charge' : 'fill-up'}</span>
        <div className="field">
          <label htmlFor="carfuel-date">Date</label>
          <input id="carfuel-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          {date && isBeforeProduction(date, { year: carYear, isCustomBuild }) && (
            <p className="error-text" role="alert" style={{ marginTop: '0.4rem' }}>
              This date is before {carYear}, when this car was made.
            </p>
          )}
        </div>
        {isElectric ? (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="carfuel-kwh">Energy added (kWh)</label>
            <input id="carfuel-kwh" type="number" min="0" step="0.1" value={kwh} onChange={(e) => setKwh(e.target.value)} required />
          </div>
        ) : (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="carfuel-litres">Litres added</label>
            <input id="carfuel-litres" type="number" min="0" step="0.01" value={litres} onChange={(e) => setLitres(e.target.value)} required />
          </div>
        )}
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carfuel-cost">Cost paid ({CURRENCY_SYMBOLS[currency]})</label>
          <input id="carfuel-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="carfuel-mileage">Mileage at the time ({unitLabel})</label>
          <input id="carfuel-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => onMileageChange(e.target.value)} required />
          {estimateNote && <p className="field-note">{estimateNote}</p>}
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        {!isElectric && (
          <div className="field-checkbox" style={{ marginTop: '0.9rem' }}>
            <label>
              <input type="checkbox" checked={filledToFull} onChange={(e) => setFilledToFull(e.target.checked)} />
              Filled the tank completely full
            </label>
            <p className="field-note" style={{ marginTop: '0.4rem' }}>
              Only a full-to-full fill-up can be used to work out real fuel economy between two logged fill-ups.
            </p>
          </div>
        )}
        <div style={{ marginTop: '0.9rem' }}>
          <AttachmentUploader value={attachment} onChange={setAttachment} idSuffix="carfuel" compareValues={{ cost: convertDisplayToGbp(Number(costDisplay) || 0, currency, rates), date }} />
        </div>
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
