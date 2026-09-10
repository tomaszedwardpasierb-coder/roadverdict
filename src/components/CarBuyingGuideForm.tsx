'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import { CAR_BRAND_OPTIONS, slugifyCarMake } from '@/lib/carPriceData';
import type { CarSizeClass } from '@/lib/tracker/car';
import { getCarSizeClass } from '@/lib/tracker/carClass';
import {
  CAR_AGE_BAND_LABELS,
  CAR_CLASS_LABELS_FOR_BUYING_GUIDE,
  type AgeBand,
  type Checklist,
} from '@/lib/tracker/carBuyerChecklist';
import type { VehicleTypeCheck } from '@/lib/tracker/vehicleTypeCheck';
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

interface CarBuyingGuideLookupResponse {
  vrm: string;
  make: string;
  model: string;
  year: number;
  fuelType: string;
  colour: string;
  engineCapacityCc: number | null;
  plateInRetention: boolean;
  vehicleType: VehicleTypeCheck;
  motDueDate: string | null;
  motTests: {
    testDate: string;
    passed: boolean;
    mileage: number | null;
    mileageTrusted: boolean;
    notes: string;
  }[];
  briefing: {
    motFlags: string[];
    modelNotes: string[];
    summary: string;
  } | null;
  vdiCheck: {
    isStolen: boolean;
    hasWriteOffRecord: boolean;
    writeOffRecordCount: number;
    hasOutstandingFinance: boolean;
    financeRecords: { agreementDate: string | null; agreementType: string | null; financeCompany: string | null }[];
    keeperChangeCount: number;
    plateChangeCount: number;
    colourChangeCount: number;
    currentColour: string | null;
  } | null;
  valuation: {
    privateAverage: number | null;
    privateClean: number | null;
    dealerForecourt: number | null;
    partExchange: number | null;
  } | null;
  vdiCheckBlockedReason?: 'cooldown';
  vdiCheckAvailableAt?: string | null;
  error?: string;
}

const CAR_CLASSES = Object.keys(CAR_CLASS_LABELS_FOR_BUYING_GUIDE) as CarSizeClass[];
const AGE_BANDS = Object.keys(CAR_AGE_BAND_LABELS) as AgeBand[];

interface Props {
  signedIn: boolean;
  isPro?: boolean;
}

export function CarBuyingGuideForm({ signedIn, isPro = false }: Props) {
  const [brand, setBrand] = useState(CAR_BRAND_OPTIONS[0].value);
  const [carClass, setCarClass] = useState<CarSizeClass>('medium');
  const [ageBand, setAgeBand] = useState<AgeBand>('used');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  // Registration search - same signed-in gate as the motorcycle buying
  // guide's own (this calls a paid, metered vehicle-data API), and the
  // same richer result: full MOT test history alongside the vehicle
  // details, since someone checking a car before buying it wants
  // purchase due-diligence info, not just make/size/age.
  const [vrm, setVrm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<ReactNode>(null);
  const [motResult, setMotResult] = useState<CarBuyingGuideLookupResponse | null>(null);
  // Free accounts opt in explicitly (it spends their 15-day allowance);
  // Pro accounts always get it, no checkbox shown at all.
  const [includeVdi, setIncludeVdi] = useState(false);

  async function handlePlateLookup() {
    if (!signedIn) {
      setLookupError(null);
      setLookupNote(
        <>
          Sign in to search by the car&apos;s registration instead of picking it manually
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
      const vdiParam = isPro || includeVdi ? '&includeVdi=1' : '';
      const res = await fetch(`/api/cars/buying-guide-lookup?vrm=${encodeURIComponent(cleaned)}${vdiParam}`);
      const data: CarBuyingGuideLookupResponse = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? 'No vehicle found for that registration. Pick it manually below instead.');
        return;
      }

      // Same gate as the "add a car" flow in the dashboard, and the same
      // spirit of wording as the motorcycle buying guide's own gate - a
      // definite non-car stops here entirely, before any of the fields
      // below get auto-filled with a motorcycle's data, and a genuinely
      // uncertain result is treated the same way rather than assumed to
      // be a car just because that's the more common case here.
      if (data.vehicleType === 'motorcycle') {
        setLookupError("Oops! Are you sure that's a car? It looks like it has two wheels. 🏍️");
        return;
      }
      if (data.vehicleType === 'unknown') {
        setLookupError("Couldn't confirm what type of vehicle this registration belongs to. Double-check the registration number, or enter the car's details manually below.");
        return;
      }

      const matchedBrand = slugifyCarMake(data.make);
      const resolvedBrand = CAR_BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      const looksElectric = /ELECTRIC/i.test(data.fuelType);
      setCarClass(getCarSizeClass(data.engineCapacityCc ? data.engineCapacityCc / 1000 : undefined, looksElectric ? 'electric' : 'petrol'));

      setMotResult(data);
      setLookupNote(
        `Found: ${data.make} ${data.model} (${data.year})${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Fields below updated - check them before getting your checklist.`
      );
    } catch {
      setLookupError("Couldn't reach the lookup service. Pick the car manually below instead.");
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

          <div className="field" style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="cbg-vrm">Search by registration (optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="cbg-vrm"
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
            {!isPro && (
              <div style={{ marginTop: '0.5rem' }}>
                <label>
                  <input
                    type="checkbox"
                    checked={includeVdi}
                    onChange={(e) => setIncludeVdi(e.target.checked)}
                    disabled={!!motResult?.vdiCheckBlockedReason}
                  />{' '}
                  Also run an independent VDI check and valuation (stolen/write-off/finance) - free once every 15 days
                </label>
                {motResult?.vdiCheckBlockedReason === 'cooldown' && (
                  <p className="field-note">
                    {motResult.vdiCheckAvailableAt
                      ? `Your next free VDI check is available from ${new Date(motResult.vdiCheckAvailableAt).toLocaleDateString('en-GB')}.`
                      : 'Your free VDI check for this period has already been used.'}
                  </p>
                )}
              </div>
            )}
            {lookupError && <p className="error-text" role="alert">{lookupError}</p>}
            {lookupNote && <p className="field-note">{lookupNote}</p>}
          </div>

          {motResult?.vdiCheck && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                Independent VDI check
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li className="field-note">{motResult.vdiCheck.isStolen ? '⚠️ Recorded as stolen' : 'No stolen marker found'}</li>
                <li className="field-note">
                  {motResult.vdiCheck.hasWriteOffRecord
                    ? `⚠️ ${motResult.vdiCheck.writeOffRecordCount} write-off record(s) on file`
                    : 'No write-off record found'}
                </li>
                <li className="field-note">
                  {motResult.vdiCheck.hasOutstandingFinance
                    ? `⚠️ ${motResult.vdiCheck.financeRecords.length} outstanding finance agreement(s) on file`
                    : 'No outstanding finance found'}
                </li>
                <li className="field-note">{motResult.vdiCheck.keeperChangeCount} keeper change(s) on record</li>
              </ul>
              {motResult.valuation && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Independent valuation</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.valuation.privateAverage != null && (
                      <li className="field-note">Private average: £{motResult.valuation.privateAverage.toLocaleString()}</li>
                    )}
                    {motResult.valuation.dealerForecourt != null && (
                      <li className="field-note">Dealer forecourt: £{motResult.valuation.dealerForecourt.toLocaleString()}</li>
                    )}
                  </ul>
                </>
              )}
            </div>
          )}

          {motResult?.briefing && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                AI-generated pre-purchase briefing for this car
              </p>
              {motResult.briefing.motFlags.length > 0 && (
                <div style={{ borderLeft: '3px solid var(--amber)', paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>
                    From this car&apos;s own MOT history
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.briefing.motFlags.map((f, i) => (
                      <li key={i} className="field-note">{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {motResult.briefing.modelNotes.length > 0 && (
                <div style={{ marginBottom: '0.6rem' }}>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>Known for this model</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.briefing.modelNotes.map((n, i) => (
                      <li key={i} className="field-note">{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="field-note">{motResult.briefing.summary}</p>
            </div>
          )}

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
