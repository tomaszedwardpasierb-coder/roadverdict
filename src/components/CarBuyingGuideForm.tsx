'use client';

import { useState, useEffect, type FormEvent, type ReactNode } from 'react';
import { CAR_BRAND_OPTIONS, slugifyCarMake } from '@/lib/carPriceData';
import type { CarSizeClass } from '@/lib/tracker/car';
import {
  CAR_AGE_BAND_LABELS,
  CAR_CLASS_LABELS_FOR_BUYING_GUIDE,
  type AgeBand,
  type Checklist,
} from '@/lib/tracker/carBuyerChecklist';
import type { BuyingGuideReportTier } from '@/lib/payments/pricing';
import type { VdiCheckResult } from '@/lib/tracker/vdiUnlock';
import { CarBuyingGuideResult } from './CarBuyingGuideResult';
import { VdiCheckReport } from './VdiCheckReport';
import { VehicleSpinner } from './VehicleSpinner';

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
  // handleBuyVdiCheck below and vdiPurchase.ts. Typed directly as the
  // server's own VdiCheckResult (see buying-guide-lookup/route.ts) -
  // it's serialized over JSON unchanged, so re-declaring its shape here
  // would just be a second copy to keep in sync.
  vdiCheck: VdiCheckResult | null;
  vdiCheckBlockedReason?: 'already_used' | 'payment_not_confirmed' | 'invalid' | 'fetch_failed';
  // Set alongside vdiCheck - when it was paid for, and how long it stays
  // retrievable for free by looking up this same plate again (see
  // vdiPurchase.ts's VDI_PURCHASE_RETRIEVAL_WINDOW_MS).
  vdiCheckPurchasedAt: string | null;
  vdiCheckExpiresAt: string | null;
  // What THIS specific purchase actually cost (0 for a Pro free-allowance
  // grant) - distinct from reportPricePence below, which is what a NEW
  // purchase would cost right now.
  vdiCheckPricePaidPence: number | null;
  // Free but rate-limited (see valuationCheckUsage.ts), fully decoupled
  // from vdiCheck's paid purchase above - always attempted on every
  // lookup while the account is within its allowance.
  valuation: {
    privateAverage: number | null;
    privateClean: number | null;
    dealerForecourt: number | null;
    partExchange: number | null;
  } | null;
  valuationBlockedReason?: 'cooldown';
  valuationAvailableAt?: string | null;
  // Free, always attempted alongside MOT history.
  taxDetails: {
    taxStatus: string | null;
    taxIsCurrentlyValid: boolean;
    taxDueDate: string | null;
    taxDaysRemaining: number | null;
    motStatus: string | null;
    vedStandardTwelveMonths: number | null;
  } | null;
  // Account-aware pricing for the report purchase above - see
  // buyingGuideReportTier.ts. Computed fresh on every lookup.
  reportTier: BuyingGuideReportTier;
  reportPricePence: number;
  reportPriceLabel: string;
  proFreeAvailable: boolean;
  nextFreeReportAt: string | null;
  // True when this account has already used its one free lookup this
  // 30-day window and this plate isn't already covered by a cache or a
  // paid report purchase - see buying-guide-lookup/route.ts. Every field
  // above is left at its empty/null default in that case.
  requiresPayment: boolean;
  nextFreeLookupAt: string | null;
  error?: string;
}

const CAR_CLASSES = Object.keys(CAR_CLASS_LABELS_FOR_BUYING_GUIDE) as CarSizeClass[];
const AGE_BANDS = Object.keys(CAR_AGE_BAND_LABELS) as AgeBand[];

interface Props {
  signedIn: boolean;
}

export function CarBuyingGuideForm({ signedIn }: Props) {
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
  const [vdiPurchasing, setVdiPurchasing] = useState(false);
  const [vdiPurchaseError, setVdiPurchaseError] = useState<string | null>(null);

  async function runLookup(cleaned: string, vdiPurchaseId?: string, stripeSessionId?: string) {
    setLookupLoading(true);
    setLookupError(null);
    setLookupNote(null);
    setMotResult(null);
    try {
      const params = new URLSearchParams({ vrm: cleaned });
      if (vdiPurchaseId) params.set('vdiPurchaseId', vdiPurchaseId);
      if (stripeSessionId) params.set('session_id', stripeSessionId);
      const res = await fetch(`/api/cars/buying-guide-lookup?${params.toString()}`);
      const data: CarBuyingGuideLookupResponse = await res.json();
      if (!res.ok) {
        setLookupError(data.error ?? 'No vehicle found for that registration. Pick it manually below instead.');
        return;
      }

      if (data.requiresPayment) {
        // No vehicle data came back at all - this account's free monthly
        // lookup is used up and this plate isn't cached or already paid
        // for, so nothing was fetched. The dedicated block further down
        // reads straight off motResult.requiresPayment.
        setMotResult(data);
        return;
      }

      const matchedBrand = slugifyCarMake(data.make);
      const resolvedBrand = CAR_BRAND_OPTIONS.some((b) => b.value === matchedBrand) ? matchedBrand : 'other';
      setBrand(resolvedBrand);

      setMotResult(data);
      setLookupNote(
        // Car size can no longer be auto-filled from this lookup -
        // CAR_MODELS deliberately carries no engine-size data, and this
        // lookup has no EngineCapacityCc either.
        `Found: ${data.make} ${data.model}${data.plateInRetention ? " - this plate isn't currently attached to a vehicle; showing the last one it was on" : ''}. Make updated - check the car size, then get your checklist.`
      );
    } catch {
      setLookupError("Couldn't reach the lookup service. Pick the car manually below instead.");
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
      // No message set here - the persistent description shown near the
      // field already explains why signing in is needed, before they
      // ever click at all.
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
      // This same form renders both as the public /cars/buying-guide page
      // and inline as the dashboard's own Buying Guide tab - Stripe needs
      // to know which one to send the buyer back to after checkout, since
      // the two are genuinely different pages (see buyingGuideVdiCheckout.ts's
      // BuyingGuideReturnContext).
      const returnTo = window.location.pathname === '/dashboard' ? 'dashboard' : 'public';
      const res = await fetch('/api/cars/buying-guide-vdi-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: cleaned, returnTo }),
      });
      const data = await res.json();
      if (!res.ok || (!data.url && !data.freeReportReady)) {
        setVdiPurchaseError(data.error ?? 'Could not start checkout. Please try again.');
        setVdiPurchasing(false);
        return;
      }
      if (data.freeReportReady && data.vdiPurchaseId) {
        // Pro's free-allowance grant - no Stripe involved, so there's no
        // return URL to fall back on if the browser closes mid-request.
        // Push the purchase id into the URL first (same shape as a real
        // Stripe return) so a refresh can still recover it, then re-run
        // the lookup immediately rather than redirecting anywhere.
        const params = new URLSearchParams({ vdiPurchaseId: data.vdiPurchaseId, vrm: cleaned });
        window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
        try {
          await runLookup(cleaned, data.vdiPurchaseId);
        } finally {
          setVdiPurchasing(false);
        }
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

          {!motResult && (
            <p className="field-note" style={{ marginBottom: '0.9rem' }}>
              {signedIn ? (
                <>
                  Enter a registration to get this car&apos;s real MOT and tax history from the DVLA, plus an
                  AI-written briefing on what to check before you buy. Add the Independent Vehicle Check for the
                  deeper picture - stolen, write-off, finance and keeper history in one place.
                </>
              ) : (
                <>
                  Search a registration and we pull this car&apos;s real MOT history and tax status straight from
                  the DVLA - then AI reads through it, alongside what&apos;s known about this exact model, to write
                  you a plain-English pre-purchase briefing: what&apos;s failed before, what&apos;s worth checking
                  in person, what this model&apos;s known for going wrong. Want the full picture before you commit?
                  A one-off Independent Vehicle Check - stolen marker, write-offs, outstanding finance, keeper
                  history, cross-checked against DVLA, police and finance-house records - is available too. Sign in
                  to search by registration - <a href="/login">sign in here</a>.
                </>
              )}
            </p>
          )}

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
                {lookupLoading && <VehicleSpinner kind="car" size={20} />}
                {lookupLoading ? 'Looking up…' : 'Look up'}
              </button>
            </div>
            {lookupError && <p className="error-text" role="alert">{lookupError}</p>}
            {lookupNote && <p className="field-note">{lookupNote}</p>}
          </div>

          {motResult?.requiresPayment && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note">
                You&apos;ve used your free car check for this period
                {motResult.nextFreeLookupAt
                  ? ` - your next free one is available ${new Date(motResult.nextFreeLookupAt).toLocaleDateString('en-GB')}`
                  : ''}
                . Buy the vehicle history report for this registration to check it now instead.
              </p>
              <button type="button" className="btn-primary" onClick={handleBuyVdiCheck} disabled={vdiPurchasing}>
                {vdiPurchasing && <VehicleSpinner kind="car" size={20} />}
                {vdiPurchasing
                  ? 'Getting your report…'
                  : motResult.proFreeAvailable
                    ? 'Get your free vehicle history report (1 every 4 weeks)'
                    : `Buy the vehicle history report - ${motResult.reportPriceLabel}`}
              </button>
              {vdiPurchaseError && <p className="error-text" role="alert">{vdiPurchaseError}</p>}
            </div>
          )}

          {motResult && !motResult.requiresPayment && !motResult.vdiCheck && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note">
                {motResult.vdiCheckBlockedReason === 'already_used' &&
                  "That report purchase has already been used - buy another to run it again."}
                {motResult.vdiCheckBlockedReason === 'payment_not_confirmed' &&
                  "We couldn't confirm that payment yet - please look up this registration again in a moment."}
                {motResult.vdiCheckBlockedReason === 'invalid' &&
                  "Something went wrong with that purchase - please buy again."}
                {motResult.vdiCheckBlockedReason === 'fetch_failed' &&
                  "Your payment went through, but we couldn't fetch the report just now - look up this registration again and it'll retry, at no extra cost."}
              </p>
              <button type="button" className="btn-primary" onClick={handleBuyVdiCheck} disabled={vdiPurchasing}>
                {vdiPurchasing && <VehicleSpinner kind="car" size={20} />}
                {vdiPurchasing
                  ? 'Getting your report…'
                  : motResult.proFreeAvailable
                    ? 'Get your free vehicle history report (1 every 4 weeks)'
                    : `Buy the vehicle history report - ${motResult.reportPriceLabel}`}
              </button>
              {motResult.reportTier === 'pro' && !motResult.proFreeAvailable && motResult.nextFreeReportAt && (
                <p className="field-note">
                  Your next free report is available {new Date(motResult.nextFreeReportAt).toLocaleDateString('en-GB')}.
                </p>
              )}
              {motResult.reportTier === 'freeNoVehicle' && (
                <p className="field-note">
                  Add a vehicle to your garage to unlock £12.99, or go Premium for £9.99 - with one free every 4 weeks.
                </p>
              )}
              <p className="field-note">Stolen marker, write-off history, outstanding finance, and keeper/plate/colour change history, straight from police/DVLA data. This check cross-references data from the DVLA, the Police National Computer (PNC), insurance databases (MIAFTR), and major finance houses, to help confirm this vehicle is safe and legal to buy.</p>
              {vdiPurchaseError && <p className="error-text" role="alert">{vdiPurchaseError}</p>}
            </div>
          )}

          {motResult?.vdiCheck && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <VdiCheckReport
                vdiCheck={motResult.vdiCheck}
                vehicleNoun="car"
                pricePaidPence={motResult.vdiCheckPricePaidPence}
                purchasedAt={motResult.vdiCheckPurchasedAt}
                expiresAt={motResult.vdiCheckExpiresAt}
              />
            </div>
          )}

          {motResult && !motResult.requiresPayment && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                Independent valuation
              </p>
              {motResult.valuation ? (
                <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                  {motResult.valuation.privateAverage != null && (
                    <li className="field-note">Private average: £{motResult.valuation.privateAverage.toLocaleString()}</li>
                  )}
                  {motResult.valuation.dealerForecourt != null && (
                    <li className="field-note">Dealer forecourt: £{motResult.valuation.dealerForecourt.toLocaleString()}</li>
                  )}
                </ul>
              ) : (
                <p className="field-note">
                  {motResult.valuationAvailableAt
                    ? `Free valuation checks used up for now - your next one is available from ${new Date(motResult.valuationAvailableAt).toLocaleDateString('en-GB')}.`
                    : 'Free valuation checks used up for now.'}
                </p>
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

          {motResult?.taxDetails && (
            <div className="field" style={{ marginBottom: '1.1rem' }}>
              <p className="field-note">
                Tax status: <strong>{motResult.taxDetails.taxStatus ?? 'Unknown'}</strong>
                {!motResult.taxDetails.taxIsCurrentlyValid && ' - NOT currently valid'}
                {motResult.taxDetails.taxDueDate && ` (due ${new Date(motResult.taxDetails.taxDueDate).toLocaleDateString('en-GB')})`}
              </p>
            </div>
          )}

          {motResult && !motResult.requiresPayment && (
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
