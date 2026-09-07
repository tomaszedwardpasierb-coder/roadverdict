'use client';

import { useState, type FormEvent } from 'react';
import { CAR_BRAND_OPTIONS } from '@/lib/carPriceData';
import type { CarSizeClass } from '@/lib/tracker/car';
import {
  CAR_AGE_BAND_LABELS,
  CAR_CLASS_LABELS_FOR_BUYING_GUIDE,
  type AgeBand,
  type Checklist,
} from '@/lib/tracker/carBuyerChecklist';
import { CarBuyingGuideResult } from './CarBuyingGuideResult';

interface ApiResponse {
  checklist: Checklist;
  addendum: string;
  brandNotes: string[] | null;
  ageBandLabel: string;
  carClassLabel: string;
  brandLabel: string;
  error?: string;
}

const CAR_CLASSES = Object.keys(CAR_CLASS_LABELS_FOR_BUYING_GUIDE) as CarSizeClass[];
const AGE_BANDS = Object.keys(CAR_AGE_BAND_LABELS) as AgeBand[];

export function CarBuyingGuideForm() {
  const [brand, setBrand] = useState(CAR_BRAND_OPTIONS[0].value);
  const [carClass, setCarClass] = useState<CarSizeClass>('medium');
  const [ageBand, setAgeBand] = useState<AgeBand>('used');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/cars/buying-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carClass, brand, ageBand }),
      });
      const data: ApiResponse = await response.json();

      if (!response.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      setResult(data);
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <form className="ticket" onSubmit={handleSubmit}>
        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">The car</span>
            <span className="ticket__step">Step 1 of 3</span>
          </div>

          <div className="field">
            <label htmlFor="cbg-brand">Make</label>
            <select id="cbg-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              {CAR_BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="cbg-carClass">Car size</label>
            <select
              id="cbg-carClass"
              value={carClass}
              onChange={(e) => setCarClass(e.target.value as CarSizeClass)}
            >
              {CAR_CLASSES.map((key) => (
                <option key={key} value={key}>
                  {CAR_CLASS_LABELS_FOR_BUYING_GUIDE[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">How old</span>
            <span className="ticket__step">Step 2 of 3</span>
          </div>
          <div className="field">
            <label htmlFor="cbg-ageBand">Roughly how old</label>
            <select
              id="cbg-ageBand"
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value as AgeBand)}
            >
              {AGE_BANDS.map((key) => (
                <option key={key} value={key}>
                  {CAR_AGE_BAND_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">Get the checklist</span>
            <span className="ticket__step">Step 3 of 3</span>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting}>
            {submitting ? 'Fetching…' : 'What should I check'}
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>

      {result && !result.error && (
        <CarBuyingGuideResult
          checklist={result.checklist}
          addendum={result.addendum}
          brandNotes={result.brandNotes}
          ageBandLabel={result.ageBandLabel}
          carClassLabel={result.carClassLabel}
          brandLabel={result.brandLabel}
        />
      )}
    </>
  );
}
