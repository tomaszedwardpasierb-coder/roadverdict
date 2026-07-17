'use client';

import { useState, type FormEvent } from 'react';
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
} from '@/lib/motorcycleModels';
import type { AnnualCostBreakdown } from '@/lib/costCalculator';
import { CostBreakdownResult } from './CostBreakdownResult';

interface ApiResponse {
  breakdown: AnnualCostBreakdown;
  brandLabel: string;
  regionLabel: string;
  error?: string;
}

const BIKE_CLASSES = Object.keys(BIKE_CLASS_LABELS) as BikeClass[];
const REGIONS = Object.keys(REGION_LABELS) as Region[];

export function CostCalculatorForm() {
  const [bikeClass, setBikeClass] = useState<BikeClass>('medium');
  const [brand, setBrand] = useState(BRAND_OPTIONS[0].value);
  const [model, setModel] = useState('');
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const [annualMileage, setAnnualMileage] = useState('4000');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

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
            <button className="submit-button" type="submit" disabled={submitting}>
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
