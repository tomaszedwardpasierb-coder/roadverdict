'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  CAR_SIZE_CLASS_LABELS,
  CAR_BRAND_OPTIONS,
  CAR_JOB_LABELS_BENCHMARKED,
  CAR_REGION_LABELS,
  slugifyCarMake,
  type CarBenchmarkClass,
  type CarJobType,
  type CarRegion,
} from '@/lib/carPriceData';
import type { Verdict } from '@/lib/verdict';
import type { VehicleTypeCheck } from '@/lib/tracker/vehicleTypeCheck';
import { CarVerdictResult } from './CarVerdictResult';

interface ApiResponse {
  verdict: Verdict;
  range: { low: number; high: number };
  brandTier: string;
  brandLabel: string;
  regionLabel: string;
  communityStats: { sampleSize: number; low: number; high: number } | null;
  error?: string;
}

interface PlateLookupResponse {
  vrm: string;
  make: string;
  model: string;
  year: number;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  vehicleType: VehicleTypeCheck;
  error?: string;
}

const CAR_CLASSES = Object.keys(CAR_SIZE_CLASS_LABELS) as CarBenchmarkClass[];
const JOB_TYPES = Object.keys(CAR_JOB_LABELS_BENCHMARKED) as CarJobType[];
const REGIONS = Object.keys(CAR_REGION_LABELS) as CarRegion[];

function classFromEngineLitres(engineLitres: number): CarBenchmarkClass {
  if (engineLitres <= 1.2) return 'small';
  if (engineLitres <= 2.0) return 'medium';
  return 'large';
}

interface Props {
  signedIn: boolean;
  initialBrand?: string;
  initialCarClass?: CarBenchmarkClass;
}

export function CarQuoteForm({ signedIn, initialBrand, initialCarClass }: Props) {
  const [carClass, setCarClass] = useState<CarBenchmarkClass>(initialCarClass ?? 'medium');
  const [brand, setBrand] = useState(initialBrand ?? CAR_BRAND_OPTIONS[0].value);
  const [region, setRegion] = useState<CarRegion>('rest-england-wales');
  const [jobType, setJobType] = useState<CarJobType>('full-service');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const [vrm, setVrm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<ReactNode>(null);

  async function handlePlateLookup() {
    if (!signedIn) {
      setLookupError(null);
      setLookupNote(
        <>
          Sign in to search by your car&apos;s registration instead of picking it manually
          below - <a href="/login">sign in here</a>.
        </>
      );
      return;
    }
    const cleaned = vrm.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleaned) {
      setLookupError('Enter a registration number first.');
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupNote(null);
    try {
      const res = await fetch(`/api/tracker/plate-lookup?vrm=${encodeURIComponent(cleaned)}`);
      const data: PlateLookupResponse = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? 'No vehicle found for that registration. Pick it manually below instead.');
        return;
      }

      // The reverse of AddCarForm's own gate - a genuine motorcycle stops
      // here entirely, before any of the fields below get auto-filled
      // with a bike's data.
      if (data.vehicleType === 'motorcycle') {
        setLookupError("That looks like a motorcycle, not a car - check your quote from the motorcycle quote checker instead.");
        return;
      }
      if (data.vehicleType === 'unknown') {
        setLookupError("Couldn't confirm what type of vehicle this registration belongs to. Double-check the registration number, or enter the car's details manually below.");
        return;
      }

      const matchedBrand = slugifyCarMake(data.make);
      const resolvedBrand = CAR_BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      if (data.engineCapacityCc) {
        setCarClass(classFromEngineLitres(data.engineCapacityCc / 1000));
      }

      setLookupNote(
        `Found: ${data.make} ${data.model} (${data.year})${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Fields below updated - check them before checking your quote.`
      );
    } catch {
      setLookupError("Couldn't reach the lookup service. Pick your car manually below instead.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const price = Number(quotedPrice);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter the price you were quoted as a number, e.g. 220.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/cars/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carClass, brand, region, jobType, quotedPrice: price }),
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
            <span className="ticket__label">Your car</span>
            <span className="ticket__step">Step 1 of 4</span>
          </div>

          <div className="field" style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="cqc-vrm">Search by registration (optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="cqc-vrm"
                type="text"
                value={vrm}
                onChange={(e) => setVrm(e.target.value)}
                placeholder="e.g. AB12 CDE"
                style={{ flex: '1 1 160px' }}
              />
              <button type="button" className="btn-primary" onClick={handlePlateLookup} disabled={lookupLoading}>
                {lookupLoading ? 'Looking up…' : 'Look up'}
              </button>
            </div>
            {lookupError && <p className="error-text" role="alert">{lookupError}</p>}
            {lookupNote && <p className="field-note">{lookupNote}</p>}
          </div>

          <div className="field">
            <label htmlFor="cqc-brand">Make</label>
            <select id="cqc-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              {CAR_BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="cqc-carClass">Car size</label>
            <select
              id="cqc-carClass"
              value={carClass}
              onChange={(e) => setCarClass(e.target.value as CarBenchmarkClass)}
            >
              {CAR_CLASSES.map((key) => (
                <option key={key} value={key}>
                  {CAR_SIZE_CLASS_LABELS[key]}
                </option>
              ))}
            </select>
            <p className="field-note">
              Electric cars aren&apos;t supported here yet - not enough sourced UK price data.
            </p>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">Where</span>
            <span className="ticket__step">Step 2 of 4</span>
          </div>
          <div className="field">
            <label htmlFor="cqc-region">Where the work is being done</label>
            <select id="cqc-region" value={region} onChange={(e) => setRegion(e.target.value as CarRegion)}>
              {REGIONS.map((key) => (
                <option key={key} value={key}>
                  {CAR_REGION_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">The job</span>
            <span className="ticket__step">Step 3 of 4</span>
          </div>
          <div className="field">
            <label htmlFor="cqc-jobType">What needs doing</label>
            <select
              id="cqc-jobType"
              value={jobType}
              onChange={(e) => setJobType(e.target.value as CarJobType)}
            >
              {JOB_TYPES.map((key) => (
                <option key={key} value={key}>
                  {CAR_JOB_LABELS_BENCHMARKED[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">Your quote</span>
            <span className="ticket__step">Step 4 of 4</span>
          </div>
          <div className="price-field">
            <div className="field price-field__input-wrap">
              <label htmlFor="cqc-quotedPrice">What you were quoted</label>
              <div className="price-field__input-wrap">
                <span className="price-field__currency">£</span>
                <input
                  id="cqc-quotedPrice"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="5000"
                  step="1"
                  placeholder="220"
                  value={quotedPrice}
                  onChange={(e) => setQuotedPrice(e.target.value)}
                  required
                />
              </div>
            </div>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Checking…' : 'Check my quote'}
            </button>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>

      {result && !result.error && (
        <CarVerdictResult
          verdict={result.verdict}
          range={result.range}
          quotedPrice={Number(quotedPrice)}
          brandLabel={result.brandLabel}
          regionLabel={result.regionLabel}
          communityStats={result.communityStats}
        />
      )}
    </>
  );
}
