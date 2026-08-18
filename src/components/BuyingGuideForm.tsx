'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  BIKE_CLASS_LABELS,
  BRAND_OPTIONS,
  type BikeClass,
} from '@/lib/priceData';
import {
  getModelsForBrand,
  getBikeClassForCC,
  slugifyMake,
} from '@/lib/motorcycleModels';
import { AGE_BAND_LABELS, type AgeBand, type Checklist } from '@/lib/buyerChecklist';
import { BuyingGuideResult } from './BuyingGuideResult';

interface ApiResponse {
  checklist: Checklist;
  addendum: string;
  brandNotes: string[] | null;
  ageBandLabel: string;
  bikeClassLabel: string;
  brandLabel: string;
  error?: string;
}

interface BuyingGuideLookupResponse {
  vrm: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  colour: string;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  motDueDate: string | null;
  motTests: {
    testDate: string;
    passed: boolean;
    mileage: number | null;
    mileageTrusted: boolean;
    notes: string;
  }[];
  error?: string;
}

const BIKE_CLASSES = Object.keys(BIKE_CLASS_LABELS) as BikeClass[];
const AGE_BANDS = Object.keys(AGE_BAND_LABELS) as AgeBand[];

interface Props {
  signedIn: boolean;
}

export function BuyingGuideForm({ signedIn }: Props) {
  const [brand, setBrand] = useState(BRAND_OPTIONS[0].value);
  const [model, setModel] = useState('');
  const [bikeClass, setBikeClass] = useState<BikeClass>('medium');
  const [ageBand, setAgeBand] = useState<AgeBand>('used');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  // Registration search - same signed-in gate as Cost Calculator and
  // Quote Checker (this calls a paid, metered vehicle-data API), but a
  // richer result here: full MOT test history alongside the vehicle
  // details, since someone checking a bike before buying it wants
  // purchase due-diligence info, not just make/model/engine.
  const [vrm, setVrm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<ReactNode>(null);
  const [motResult, setMotResult] = useState<BuyingGuideLookupResponse | null>(null);

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
          Sign in to search by the bike&apos;s registration instead of picking it manually
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
    setMotResult(null);
    try {
      const res = await fetch(`/api/tracker/buying-guide-lookup?vrm=${encodeURIComponent(cleaned)}`);
      const data: BuyingGuideLookupResponse = await res.json();
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

      if (data.engineCapacityCc) {
        setBikeClass(getBikeClassForCC(data.engineCapacityCc));
      }

      setMotResult(data);
      setLookupNote(
        `Found: ${data.make} ${data.model} (${data.year})${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Fields below updated - check them before getting your checklist.`
      );
    } catch {
      setLookupError("Couldn't reach the lookup service. Pick the bike manually below instead.");
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/buying-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bikeClass, brand, ageBand }),
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
            <span className="ticket__label">The bike</span>
            <span className="ticket__step">Step 1 of 3</span>
          </div>

          <div className="field" style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="bg-vrm">Search by registration (optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="bg-vrm"
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

          {motResult && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note" style={{ fontWeight: 600, marginBottom: '0.4rem' }}>
                {motResult.motDueDate
                  ? `MOT due ${new Date(motResult.motDueDate).toLocaleDateString('en-GB')}`
                  : 'No MOT due date on record (may be MOT-exempt, or too new to have tested yet)'}
              </p>
              {motResult.motTests.length === 0 ? (
                <p className="field-note">No MOT test history found for this registration.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {motResult.motTests.map((t, i) => (
                    <div key={i} className="field-note" style={{ borderLeft: `3px solid ${t.passed ? 'var(--verdict-green)' : 'var(--verdict-red)'}`, paddingLeft: '0.6rem' }}>
                      <strong>{new Date(t.testDate).toLocaleDateString('en-GB')}</strong> - {t.passed ? 'Passed' : 'Failed'}
                      {' - '}
                      {t.mileage != null ? `${t.mileage.toLocaleString()} miles${t.mileageTrusted ? '' : ' (reading not verified)'}` : 'mileage not recorded'}
                      {t.notes && <div>{t.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label htmlFor="bg-brand">Make</label>
            <select
              id="bg-brand"
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
            <label htmlFor="bg-model">Model</label>
            <select
              id="bg-model"
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
              <label htmlFor="bg-bikeClass">Engine size</label>
              <select
                id="bg-bikeClass"
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
            <span className="ticket__label">How old</span>
            <span className="ticket__step">Step 2 of 3</span>
          </div>
          <div className="field">
            <label htmlFor="bg-ageBand">Roughly how old</label>
            <select
              id="bg-ageBand"
              value={ageBand}
              onChange={(e) => setAgeBand(e.target.value as AgeBand)}
            >
              {AGE_BANDS.map((key) => (
                <option key={key} value={key}>
                  {AGE_BAND_LABELS[key]}
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
        <BuyingGuideResult
          checklist={result.checklist}
          addendum={result.addendum}
          brandNotes={result.brandNotes}
          ageBandLabel={result.ageBandLabel}
          bikeClassLabel={result.bikeClassLabel}
          brandLabel={result.brandLabel}
        />
      )}
    </>
  );
}
