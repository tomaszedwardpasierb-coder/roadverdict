'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BIKE_CLASS_LABELS,
  BRAND_OPTIONS,
  REGION_LABELS,
  type BikeClass,
  type Region,
} from '@/lib/priceData';
import {
  getModelsForBrand,
  getBikeClassForCC,
  slugifyMake,
} from '@/lib/motorcycleModels';
import type { AnnualCostBreakdown } from '@/lib/costCalculator';
import { CostBreakdownResult } from './CostBreakdownResult';

interface ApiResponse {
  breakdown: AnnualCostBreakdown;
  brandLabel: string;
  regionLabel: string;
  error?: string;
}

interface PlateLookupResponse {
  vrm: string;
  make: string;
  model: string;
  year: number;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  error?: string;
}

const BIKE_CLASSES = Object.keys(BIKE_CLASS_LABELS) as BikeClass[];
const REGIONS = Object.keys(REGION_LABELS) as Region[];

interface Props {
  signedIn: boolean;
  initialBrand?: string;
  initialModel?: string;
  initialBikeClass?: BikeClass;
}

export function CostCalculatorForm({ signedIn, initialBrand, initialModel, initialBikeClass }: Props) {
  const [bikeClass, setBikeClass] = useState<BikeClass>(initialBikeClass ?? 'medium');
  const [brand, setBrand] = useState(initialBrand ?? BRAND_OPTIONS[0].value);
  const [model, setModel] = useState(initialModel ?? '');
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const [annualMileage, setAnnualMileage] = useState('4000');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  // Registration search - reuses the same lookup the tracker's "add
  // bike" flow uses, which is why it's only offered signed in: that
  // endpoint calls a paid, metered vehicle-data API, and requiring a
  // session is what keeps it from being an open, unmetered public
  // endpoint. Left enabled after a successful lookup rather than
  // locked, so a different plate can be searched immediately without
  // reloading the page.
  const [vrm, setVrm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<ReactNode>(null);

  const modelsForBrand = getModelsForBrand(brand);

  function handleBrandChange(newBrand: string) {
    setBrand(newBrand);
    setModel('');
  }

  function handleModelChange(newModel: string) {
    setModel(newModel);
    if (newModel) {
      const selected = modelsForBrand.find((m) => m.model === newModel);
      if (selected) {
        setBikeClass(getBikeClassForCC(selected.engineCC));
      }
    }
  }

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

      const matchedBrand = slugifyMake(data.make);
      const resolvedBrand = BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      const candidates = getModelsForBrand(resolvedBrand);
      const matchedModel = candidates.find(
        (m) => m.model.toLowerCase().includes(data.model.toLowerCase()) || data.model.toLowerCase().includes(m.model.toLowerCase())
      );
      setModel(matchedModel?.model ?? '');

      // The engine size drives the actual price estimate - set from
      // the looked-up figure directly rather than only from a matched
      // model, since a real vehicle very often won't have an exact
      // match in the curated model list even when the brand does.
      if (data.engineCapacityCc) {
        setBikeClass(getBikeClassForCC(data.engineCapacityCc));
      }

      setLookupNote(
        `Found: ${data.make} ${data.model} (${data.year})${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Fields below updated - check them before working it out.`
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

    const mileage = Number(annualMileage);
    if (!Number.isFinite(mileage) || mileage <= 0) {
      setError('Enter your typical annual mileage as a number, e.g. 4000.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/cost-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeClass, brand, region, annualMileage: mileage }),
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
            <span className="ticket__step">Step 1 of 3</span>
          </div>

          <div className="field" style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="cc-vrm">Search by registration (optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="cc-vrm"
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
            <label htmlFor="cc-brand">Make</label>
            <select
              id="cc-brand"
              value={brand}
              onChange={(e) => handleBrandChange(e.target.value)}
            >
              {BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="cc-model">Model</label>
            <select
              id="cc-model"
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
            >
              <option value="">Not sure / other model</option>
              {modelsForBrand.map((m) => (
                <option key={m.model} value={m.model}>
                  {m.model} ({m.engineCC}cc)
                </option>
              ))}
            </select>
          </div>
          {model ? (
            <div className="field-note" style={{ marginTop: '0.9rem' }}>
              Engine size: {BIKE_CLASS_LABELS[bikeClass]} (from {model})
            </div>
          ) : (
            <div className="field" style={{ marginTop: '0.9rem' }}>
              <label htmlFor="cc-bikeClass">Engine size</label>
              <select
                id="cc-bikeClass"
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
          )}
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">Where</span>
            <span className="ticket__step">Step 2 of 3</span>
          </div>
          <div className="field">
            <label htmlFor="cc-region">Where you keep and run it</label>
            <select
              id="cc-region"
              value={region}
              onChange={(e) => setRegion(e.target.value as Region)}
            >
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
            <span className="ticket__label">Your riding</span>
            <span className="ticket__step">Step 3 of 3</span>
          </div>
          <div className="price-field">
            <div className="field price-field__input-wrap">
              <label htmlFor="cc-mileage">Typical miles per year</label>
              <input
                id="cc-mileage"
                type="number"
                inputMode="numeric"
                min="0"
                max="30000"
                placeholder="4000"
                value={annualMileage}
                onChange={(e) => setAnnualMileage(e.target.value)}
                required
              />
            </div>
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Calculating…' : 'Work it out'}
            </button>
          </div>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>

      {result && !result.error && (
        <CostBreakdownResult
          breakdown={result.breakdown}
          brandLabel={result.brandLabel}
          regionLabel={result.regionLabel}
        />
      )}
    </>
  );
}
