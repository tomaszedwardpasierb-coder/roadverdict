'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BIKE_CLASS_LABELS,
  BRAND_OPTIONS,
  JOB_LABELS,
  REGION_LABELS,
  type BikeClass,
  type JobType,
  type Region,
} from '@/lib/priceData';
import { getModelsForBrand, getBikeClassForCC, slugifyMake } from '@/lib/motorcycleModels';
import type { Verdict } from '@/lib/verdict';
import type { VehicleTypeCheck } from '@/lib/tracker/vehicleTypeCheck';
import { VerdictResult } from './VerdictResult';

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

const BIKE_CLASSES = Object.keys(BIKE_CLASS_LABELS) as BikeClass[];
const JOB_TYPES = Object.keys(JOB_LABELS) as JobType[];
const REGIONS = Object.keys(REGION_LABELS) as Region[];

interface Props {
  signedIn: boolean;
  initialBrand?: string;
  initialBikeClass?: BikeClass;
}

export function QuoteForm({ signedIn, initialBrand, initialBikeClass }: Props) {
  const [bikeClass, setBikeClass] = useState<BikeClass>(initialBikeClass ?? 'medium');
  const [brand, setBrand] = useState(initialBrand ?? BRAND_OPTIONS[0].value);
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const [jobType, setJobType] = useState<JobType>('full-service');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  // Same registration-search mechanism as Cost Calculator, deliberately
  // kept identical rather than reimplemented - same endpoint, same
  // signed-in gate (that endpoint calls a paid, metered vehicle-data
  // API), same behavior of showing the box to everyone and only
  // blocking the actual lookup when clicked while signed out.
  const [vrm, setVrm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<ReactNode>(null);

  async function handlePlateLookup() {
    if (!signedIn) {
      setLookupError(null);
      setLookupNote(
        <>
          Sign in to search by your bike&apos;s registration instead of picking it manually
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

      // Same gate as the "add a bike" flow in the dashboard, and the
      // exact same wording - a definite non-motorcycle stops here
      // entirely, before any of the fields below get auto-filled with
      // a car's data, and a genuinely uncertain result is treated the
      // same way rather than assumed to be a bike just because that's
      // the more common case.
      if (data.vehicleType === 'four-wheeled') {
        setLookupError("Oops! Are you sure that's a bike? It looks like it has four wheels. 🏍️");
        return;
      }
      if (data.vehicleType === 'unknown') {
        setLookupError("Couldn't confirm what type of vehicle this registration belongs to. Double-check the registration number, or enter the bike's details manually below.");
        return;
      }

      const matchedBrand = slugifyMake(data.make);
      const resolvedBrand = BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      if (data.engineCapacityCc) {
        setBikeClass(getBikeClassForCC(data.engineCapacityCc));
      }

      setLookupNote(
        `Found: ${data.make} ${data.model} (${data.year})${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Fields below updated - check them before checking your quote.`
      );
    } catch {
      setLookupError("Couldn't reach the lookup service. Pick your bike manually below instead.");
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
      setError('Enter the price you were quoted as a number, e.g. 180.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/verdict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeClass, brand, region, jobType, quotedPrice: price }),
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
            <span className="ticket__label">Your bike</span>
            <span className="ticket__step">Step 1 of 4</span>
          </div>

          <div className="field" style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="qc-vrm">Search by registration (optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="qc-vrm"
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
            <label htmlFor="brand">Make</label>
            <select id="brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              {BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bikeClass">Engine size</label>
            <select
              id="bikeClass"
              value={bikeClass}
              onChange={(e) => setBikeClass(e.target.value as BikeClass)}
            >
              {BIKE_CLASSES.map((key) => (
                <option key={key} value={key}>
                  {BIKE_CLASS_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">Where</span>
            <span className="ticket__step">Step 2 of 4</span>
          </div>
          <div className="field">
            <label htmlFor="region">Where the work is being done</label>
            <select id="region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
              {REGIONS.map((key) => (
                <option key={key} value={key}>
                  {REGION_LABELS[key]}
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
            <label htmlFor="jobType">What needs doing</label>
            <select
              id="jobType"
              value={jobType}
              onChange={(e) => setJobType(e.target.value as JobType)}
            >
              {JOB_TYPES.map((key) => (
                <option key={key} value={key}>
                  {JOB_LABELS[key]}
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
              <label htmlFor="quotedPrice">What you were quoted</label>
              <div className="price-field__input-wrap">
                <span className="price-field__currency">£</span>
                <input
                  id="quotedPrice"
                  type="number"
                  inputMode="decimal"
                  min="1"
                  max="5000"
                  step="1"
                  placeholder="180"
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
        <VerdictResult
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
