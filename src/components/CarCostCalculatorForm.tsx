'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import {
  CAR_SIZE_CLASS_LABELS,
  CAR_BRAND_OPTIONS,
  CAR_REGION_LABELS,
  slugifyCarMake,
  type CarBenchmarkClass,
  type CarRegion,
} from '@/lib/carPriceData';
import type { CarAnnualCostBreakdown } from '@/lib/carCostCalculator';
import { CarCostBreakdownResult } from './CarCostBreakdownResult';

interface ApiResponse {
  breakdown: CarAnnualCostBreakdown;
  brandLabel: string;
  regionLabel: string;
  advice: { explanation: string; watchOutFor: string[] } | null;
  error?: string;
}

interface TaxDetails {
  taxStatus: string | null;
  taxIsCurrentlyValid: boolean;
  taxDueDate: string | null;
  taxDaysRemaining: number | null;
  vedStandardTwelveMonths: number | null;
}

interface CostLookupResponse {
  vrm: string;
  make: string;
  model: string;
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
  motDueDate: string | null;
  motTests: { testDate: string; passed: boolean; mileage: number | null; mileageTrusted: boolean; notes: string }[];
  taxDetails: TaxDetails | null;
  error?: string;
}

type CarFuelTypeOption = 'petrol' | 'diesel' | 'hybrid' | 'phev';

const CAR_CLASSES = Object.keys(CAR_SIZE_CLASS_LABELS) as CarBenchmarkClass[];
const REGIONS = Object.keys(CAR_REGION_LABELS) as CarRegion[];
const FUEL_TYPE_LABELS: Record<CarFuelTypeOption, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  hybrid: 'Hybrid (self-charging)',
  phev: 'Plug-in hybrid (PHEV)',
};
const FUEL_TYPES = Object.keys(FUEL_TYPE_LABELS) as CarFuelTypeOption[];

// Mirrors AddCarForm.tsx's own mapDvlaFuelType, duplicated rather than
// imported - that one returns CarFuelType (includes 'electric'), which
// this form's own fuel-type selector deliberately doesn't offer.
function mapDvlaFuelType(raw: string): CarFuelTypeOption | 'electric' | null {
  const v = raw.toUpperCase();
  if (v.includes('HYBRID')) return 'hybrid';
  if (v === 'ELECTRICITY' || v.includes('ELECTRIC')) return 'electric';
  if (v.includes('DIESEL')) return 'diesel';
  if (v.includes('PETROL') || v.includes('GAS')) return 'petrol';
  return null;
}

interface Props {
  signedIn: boolean;
  initialBrand?: string;
  initialCarClass?: CarBenchmarkClass;
}

export function CarCostCalculatorForm({ signedIn, initialBrand, initialCarClass }: Props) {
  const [carClass, setCarClass] = useState<CarBenchmarkClass>(initialCarClass ?? 'medium');
  const [brand, setBrand] = useState(initialBrand ?? CAR_BRAND_OPTIONS[0].value);
  const [region, setRegion] = useState<CarRegion>('rest-england-wales');
  const [fuelType, setFuelType] = useState<CarFuelTypeOption>('petrol');
  const [annualMileage, setAnnualMileage] = useState('7000');
  const [co2Gkm, setCo2Gkm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApiResponse | null>(null);

  const [vrm, setVrm] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupNote, setLookupNote] = useState<ReactNode>(null);
  // Silently carried through to the submit request - this tool's UI
  // doesn't display MOT/tax detail itself, it just lets the AI advice
  // reference real facts about this exact car.
  const [motTests, setMotTests] = useState<CostLookupResponse['motTests']>([]);
  const [taxDetails, setTaxDetails] = useState<TaxDetails | null>(null);

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
      const res = await fetch(`/api/tracker/cost-calculator-lookup?vrm=${encodeURIComponent(cleaned)}`);
      const data: CostLookupResponse = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? 'No vehicle found for that registration. Pick it manually below instead.');
        return;
      }

      const matchedBrand = slugifyCarMake(data.make);
      const resolvedBrand = CAR_BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      // Car size can no longer be auto-filled from this lookup -
      // CAR_MODELS deliberately carries no engine-size data, and this
      // lookup has no EngineCapacityCc either.
      const guessedFuelType = mapDvlaFuelType(String(data.fuelType ?? ''));
      if (guessedFuelType === 'electric') {
        setLookupNote(
          `Found: ${data.make} ${data.model} - looks fully electric. Electric running costs aren't supported here yet, so the fields below are left as a similar-sized petrol/diesel estimate instead.`
        );
      } else {
        if (guessedFuelType) setFuelType(guessedFuelType);
        setLookupNote(
          `Found: ${data.make} ${data.model}${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Make and fuel type updated - check the car size, then work it out.`
        );
      }
      setMotTests(data.motTests);
      setTaxDetails(data.taxDetails);
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

    const mileage = Number(annualMileage);
    if (!Number.isFinite(mileage) || mileage <= 0) {
      setError('Enter your typical annual mileage as a number, e.g. 7000.');
      return;
    }
    const co2 = co2Gkm.trim() === '' ? undefined : Number(co2Gkm);
    if (co2 !== undefined && (!Number.isFinite(co2) || co2 < 0)) {
      setError('Enter your CO2 figure as a number, e.g. 120, or leave it blank.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/cars/cost-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          carClass, brand, region, fuelType, annualMileage: mileage, co2Gkm: co2,
          motTests: motTests.length > 0 ? motTests.map(({ testDate, passed, notes }) => ({ testDate, passed, notes })) : undefined,
          taxStatus: taxDetails ?? undefined,
        }),
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
            <span className="ticket__step">Step 1 of 3</span>
          </div>

          <div className="field" style={{ marginBottom: '1.1rem' }}>
            <label htmlFor="ccc-vrm">Search by registration (optional)</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="ccc-vrm"
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
            <label htmlFor="ccc-brand">Make</label>
            <select id="ccc-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
              {CAR_BRAND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="ccc-carClass">Car size</label>
            <select
              id="ccc-carClass"
              value={carClass}
              onChange={(e) => setCarClass(e.target.value as CarBenchmarkClass)}
            >
              {CAR_CLASSES.map((key) => (
                <option key={key} value={key}>
                  {CAR_SIZE_CLASS_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="ccc-fuelType">Fuel type</label>
            <select
              id="ccc-fuelType"
              value={fuelType}
              onChange={(e) => setFuelType(e.target.value as CarFuelTypeOption)}
            >
              {FUEL_TYPES.map((key) => (
                <option key={key} value={key}>
                  {FUEL_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
            <p className="field-note">
              Fully electric cars aren&apos;t supported here yet - not enough sourced UK running-cost data.
            </p>
          </div>
        </div>

        <hr className="ticket__divider" />

        <div className="ticket__section">
          <div className="ticket__eyebrow">
            <span className="ticket__label">Where</span>
            <span className="ticket__step">Step 2 of 3</span>
          </div>
          <div className="field">
            <label htmlFor="ccc-region">Where you keep and run it</label>
            <select
              id="ccc-region"
              value={region}
              onChange={(e) => setRegion(e.target.value as CarRegion)}
            >
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
            <span className="ticket__label">Your driving</span>
            <span className="ticket__step">Step 3 of 3</span>
          </div>
          <div className="field" style={{ marginBottom: '0.9rem' }}>
            <label htmlFor="ccc-mileage">Typical miles per year</label>
            <input
              id="ccc-mileage"
              type="number"
              inputMode="numeric"
              min="0"
              max="30000"
              placeholder="7000"
              value={annualMileage}
              onChange={(e) => setAnnualMileage(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="ccc-co2">CO2 emissions, g/km (optional, for road tax)</label>
            <input
              id="ccc-co2"
              type="number"
              inputMode="numeric"
              min="0"
              max="999"
              placeholder="e.g. 120 - check your V5C logbook"
              value={co2Gkm}
              onChange={(e) => setCo2Gkm(e.target.value)}
            />
            <p className="field-note">
              Leave blank if you don&apos;t know it - road tax will show as an estimate you can
              check on GOV.UK instead.
            </p>
          </div>
          <button className="btn-primary" type="submit" disabled={submitting} style={{ marginTop: '0.9rem' }}>
            {submitting ? 'Calculating…' : 'Work it out'}
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>

      {result && !result.error && (
        <CarCostBreakdownResult
          breakdown={result.breakdown}
          brandLabel={result.brandLabel}
          regionLabel={result.regionLabel}
          advice={result.advice}
        />
      )}
    </>
  );
}
