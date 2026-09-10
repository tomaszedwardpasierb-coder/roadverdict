'use client';

import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
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
import { BUYING_GUIDE_VDI_CHECK_PRICE_LABEL } from '@/lib/payments/pricing';
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
  fuelType: string;
  colour: string;
  plateInRetention: boolean;
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
  // Only ever populated once the standalone £9.99 VDI check has been
  // bought and successfully run for this exact plate - see
  // handleBuyVdiCheck below and vdiPurchase.ts.
  vdiCheck: {
    isStolen: boolean;
    hasWriteOffRecord: boolean;
    writeOffRecordCount: number;
    hasOutstandingFinance: boolean;
    financeRecords: { agreementDate: string | null; agreementType: string | null; financeCompany: string | null }[];
    keeperChanges: { keeperStartDate: string; previousKeeperDisposalDate: string | null }[];
    keeperChangeCount: number;
    plateChangeCount: number;
    colourChangeCount: number;
    currentColour: string | null;
    v5cReissueCount: number;
    calculatedAverageAnnualMileage: number | null;
    averageMileageForAge: number | null;
    mileageAnomalyDetected: boolean;
    manufacturerWarrantyMiles: number | null;
    manufacturerWarrantyMonths: number | null;
  } | null;
  vdiCheckBlockedReason?: 'already_used' | 'payment_not_confirmed' | 'invalid' | 'fetch_failed';
  // Set alongside vdiCheck - when it was paid for, and how long it stays
  // retrievable for free by looking up this same plate again (see
  // vdiPurchase.ts's VDI_PURCHASE_RETRIEVAL_WINDOW_MS).
  vdiCheckPurchasedAt: string | null;
  vdiCheckExpiresAt: string | null;
  // Free, always attempted alongside MOT history.
  taxDetails: {
    taxStatus: string | null;
    taxIsCurrentlyValid: boolean;
    taxDueDate: string | null;
    taxDaysRemaining: number | null;
    motStatus: string | null;
    vedStandardTwelveMonths: number | null;
  } | null;
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
  const [vdiPurchasing, setVdiPurchasing] = useState(false);
  const [vdiPurchaseError, setVdiPurchaseError] = useState<string | null>(null);

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

  async function runLookup(cleaned: string, vdiPurchaseId?: string, stripeSessionId?: string) {
    setLookupLoading(true);
    setLookupError(null);
    setLookupNote(null);
    setMotResult(null);
    try {
      const params = new URLSearchParams({ vrm: cleaned });
      if (vdiPurchaseId) params.set('vdiPurchaseId', vdiPurchaseId);
      if (stripeSessionId) params.set('session_id', stripeSessionId);
      const res = await fetch(`/api/tracker/buying-guide-lookup?${params.toString()}`);
      const data: BuyingGuideLookupResponse = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? 'No vehicle found for that registration. Pick it manually below instead.');
        return;
      }

      const matchedBrand = slugifyMake(data.make);
      const resolvedBrand = BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      // No EngineCapacityCc from this lookup (MotHistoryDetails doesn't
      // carry it) - infer engine size by matching the returned Model
      // against this brand's own curated model list instead.
      const candidates = getModelsForBrand(resolvedBrand);
      const matchedModel = candidates.find(
        (m) => m.model.toLowerCase().includes(data.model.toLowerCase()) || data.model.toLowerCase().includes(m.model.toLowerCase())
      );
      setModel(matchedModel?.model ?? '');
      if (matchedModel) {
        setBikeClass(getBikeClassForCC(matchedModel.engineCC));
      }

      setMotResult(data);
      setLookupNote(
        `Found: ${data.make} ${data.model}${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Fields below updated - check them before getting your checklist.`
      );
    } catch {
      setLookupError("Couldn't reach the lookup service. Pick the bike manually below instead.");
    } finally {
      setLookupLoading(false);
    }
  }

  // Picks up a return from Stripe after buying the standalone VDI check
  // (see handleBuyVdiCheck below) - the checkout session's success_url
  // sends the buyer straight back here with the purchase id, the plate
  // they were checking, and the raw Stripe session id (used by the
  // lookup route's own self-heal if the webhook hasn't landed yet).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const vdiPurchaseId = params.get('vdiPurchaseId');
    const returnedVrm = params.get('vrm');
    const stripeSessionId = params.get('session_id');
    if (vdiPurchaseId && returnedVrm) {
      window.history.replaceState(null, '', window.location.pathname);
      setVrm(returnedVrm);
      void runLookup(returnedVrm, vdiPurchaseId, stripeSessionId ?? undefined);
    }
    // Deliberately run-once-on-mount: this only ever matters for the
    // single page load right after a Stripe redirect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    await runLookup(cleaned);
  }

  async function handleBuyVdiCheck() {
    const cleaned = vrm.trim().toUpperCase().replace(/\s+/g, '');
    if (!cleaned) {
      setVdiPurchaseError('Look up a registration first.');
      return;
    }
    setVdiPurchasing(true);
    setVdiPurchaseError(null);
    try {
      const res = await fetch('/api/tracker/buying-guide-vdi-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: cleaned }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setVdiPurchaseError(data.error ?? 'Could not start checkout. Please try again.');
        setVdiPurchasing(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setVdiPurchaseError("Couldn't reach the payment service. Please try again.");
      setVdiPurchasing(false);
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

          {motResult && !motResult.vdiCheck && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note">
                {motResult.vdiCheckBlockedReason === 'already_used' &&
                  "That Independent Vehicle Check purchase has already been used - buy another to run it again."}
                {motResult.vdiCheckBlockedReason === 'payment_not_confirmed' &&
                  "We couldn't confirm that payment yet - please look up this registration again in a moment."}
                {motResult.vdiCheckBlockedReason === 'invalid' &&
                  "Something went wrong with that purchase - please buy again."}
                {motResult.vdiCheckBlockedReason === 'fetch_failed' &&
                  "Your payment went through, but we couldn't fetch the check just now - look up this registration again and it'll retry, at no extra cost."}
              </p>
              <button type="button" className="btn-primary" onClick={handleBuyVdiCheck} disabled={vdiPurchasing}>
                {vdiPurchasing ? 'Starting checkout…' : `Buy Independent Vehicle Check - ${BUYING_GUIDE_VDI_CHECK_PRICE_LABEL}`}
              </button>
              <p className="field-note">Stolen marker, write-off history, outstanding finance, and keeper/plate/colour change history, straight from police/DVLA data.</p>
              {vdiPurchaseError && <p className="error-text" role="alert">{vdiPurchaseError}</p>}
            </div>
          )}

          {motResult?.vdiCheck && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <div style={{ borderLeft: '3px solid var(--verdict-green)', paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
                <p className="field-note" style={{ fontWeight: 600, margin: 0 }}>
                  ✓ Independent VDI check - included with your {BUYING_GUIDE_VDI_CHECK_PRICE_LABEL} purchase
                </p>
                {motResult.vdiCheckPurchasedAt && (
                  <p className="field-note" style={{ margin: '0.2rem 0 0' }}>
                    Bought {new Date(motResult.vdiCheckPurchasedAt).toLocaleDateString('en-GB')}
                    {motResult.vdiCheckExpiresAt &&
                      ` - free to look up again until ${new Date(motResult.vdiCheckExpiresAt).toLocaleDateString('en-GB')}`}
                    .
                  </p>
                )}
              </div>
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
                <li className="field-note">{motResult.vdiCheck.plateChangeCount} plate change(s) on record</li>
                <li className="field-note">
                  {motResult.vdiCheck.colourChangeCount} colour change(s) on record
                  {motResult.vdiCheck.currentColour ? ` (currently ${motResult.vdiCheck.currentColour.toLowerCase()})` : ''}
                </li>
                {motResult.vdiCheck.calculatedAverageAnnualMileage != null && motResult.vdiCheck.averageMileageForAge != null && (
                  <li className="field-note">
                    Average annual mileage: {motResult.vdiCheck.calculatedAverageAnnualMileage.toLocaleString()} mi/year
                    (typical for this age: {motResult.vdiCheck.averageMileageForAge.toLocaleString()})
                    {motResult.vdiCheck.mileageAnomalyDetected ? ' - ⚠️ anomaly flagged' : ''}
                  </li>
                )}
                {(motResult.vdiCheck.manufacturerWarrantyMonths != null || motResult.vdiCheck.manufacturerWarrantyMiles != null) && (
                  <li className="field-note">
                    Manufacturer warranty:{' '}
                    {[
                      motResult.vdiCheck.manufacturerWarrantyMonths ? `${motResult.vdiCheck.manufacturerWarrantyMonths} months` : null,
                      motResult.vdiCheck.manufacturerWarrantyMiles ? `${motResult.vdiCheck.manufacturerWarrantyMiles.toLocaleString()} miles` : null,
                    ]
                      .filter(Boolean)
                      .join(' / ')}{' '}
                    from new
                  </li>
                )}
              </ul>
              {motResult.vdiCheck.keeperChanges.length > 0 && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Keeper change history</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {[...motResult.vdiCheck.keeperChanges].reverse().map((k, i) => (
                      <li key={i} className="field-note">
                        {new Date(k.keeperStartDate).toLocaleDateString('en-GB')} - new keeper registered
                        {k.previousKeeperDisposalDate
                          ? ` (previous keeper disposed ${new Date(k.previousKeeperDisposalDate).toLocaleDateString('en-GB')})`
                          : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {motResult?.briefing && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                AI-generated pre-purchase briefing for this bike
              </p>
              {motResult.briefing.motFlags.length > 0 && (
                <div style={{ borderLeft: '3px solid var(--amber)', paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>
                    From this bike&apos;s own MOT history
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

          {motResult?.taxDetails && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note">
                Tax status: <strong>{motResult.taxDetails.taxStatus ?? 'Unknown'}</strong>
                {!motResult.taxDetails.taxIsCurrentlyValid && ' - NOT currently valid'}
                {motResult.taxDetails.taxDueDate && ` (due ${new Date(motResult.taxDetails.taxDueDate).toLocaleDateString('en-GB')})`}
              </p>
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
