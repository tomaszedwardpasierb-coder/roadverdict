'use client';

import { useState, type FormEvent } from 'react';
import {
  BIKE_CLASS_LABELS,
  BRAND_OPTIONS,
  JOB_LABELS,
  REGION_LABELS,
  type BikeClass,
  type JobType,
  type Region,
} from '@/lib/priceData';
import type { Verdict } from '@/lib/verdict';
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

const BIKE_CLASSES = Object.keys(BIKE_CLASS_LABELS) as BikeClass[];
const JOB_TYPES = Object.keys(JOB_LABELS) as JobType[];
const REGIONS = Object.keys(REGION_LABELS) as Region[];

export function QuoteForm() {
  const [bikeClass, setBikeClass] = useState<BikeClass>('medium');
  const [brand, setBrand] = useState(BRAND_OPTIONS[0].value);
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const [jobType, setJobType] = useState<JobType>('full-service');
  const [quotedPrice, setQuotedPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

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
            <button className="submit-button" type="submit" disabled={submitting}>
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
