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
import { CarBuyingGuideResult } from './CarBuyingGuideResult';
import { VdiMileageChart } from './VdiMileageChart';

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
  // handleBuyVdiCheck below and vdiPurchase.ts.
  vdiCheck: {
    isStolen: boolean;
    hasWriteOffRecord: boolean;
    writeOffRecordCount: number;
    hasOutstandingFinance: boolean;
    financeRecords: { agreementDate: string | null; agreementType: string | null; financeCompany: string | null }[];
    keeperChanges: { keeperStartDate: string; previousKeeperDisposalDate: string | null; numberOfPreviousKeepers?: number | null }[];
    keeperChangeCount: number;
    plateChanges?: { currentVrm: string | null; previousVrm: string | null; dateOfTransaction: string | null }[];
    plateChangeCount: number;
    colourChangeCount: number;
    currentColour: string | null;
    originalColour?: string | null;
    previousColour?: string | null;
    v5cReissueCount: number;
    calculatedAverageAnnualMileage: number | null;
    averageMileageForAge: number | null;
    mileageAnomalyDetected: boolean;
    manufacturerWarrantyMiles: number | null;
    manufacturerWarrantyMonths: number | null;
    dateFirstRegisteredInUk?: string | null;
    dateOfManufacture?: string | null;
    vedStandardSixMonths?: number | null;
    vedStandardTwelveMonths?: number | null;
    taxationClass?: string | null;
    bhp?: number | null;
    soundLevels?: { stationaryDb: number | null; driveByDb: number | null; engineSpeedRpm: number | null } | null;
    series?: string | null;
    platformName?: string | null;
    countryOfOrigin?: string | null;
    dvlaFuelType?: string | null;
    bodyStyle?: string | null;
    dvlaBodyType?: string | null;
    dvlaWheelPlan?: string | null;
    isImported?: boolean;
    isImportedFromOutsideEu?: boolean;
    isScrapped?: boolean;
    certificateOfDestructionIssued?: boolean;
    euroStatus?: string | null;
    dvlaCo2?: number | null;
    dvlaCo2Band?: string | null;
    kerbWeightKg?: number | null;
    grossCombinedWeightKg?: number | null;
    cylinderArrangement?: string | null;
    numberOfCylinders?: number | null;
    aspiration?: string | null;
    transmissionType?: string | null;
    numberOfGears?: number | null;
    drivingAxle?: string | null;
    fuelTankCapacityLitres?: number | null;
    ps?: number | null;
    torqueNm?: number | null;
    torqueRpm?: number | null;
    zeroToSixtyMph?: number | null;
    zeroToOneHundredKph?: number | null;
    maxSpeedMph?: number | null;
    maxSpeedKph?: number | null;
    fuelEconomy?: {
      urbanColdMpg: number | null;
      extraUrbanMpg: number | null;
      combinedMpg: number | null;
      urbanColdL100Km: number | null;
      extraUrbanL100Km: number | null;
      combinedL100Km: number | null;
    } | null;
    pncDetail?: {
      policeForceName: string | null;
      currentStatusOnRecord: string | null;
      dateReportedStolen: string | null;
      dateRecordAddedToPnc: string | null;
    } | null;
    mileageReadings?: { date: string; mileage: number; inSequence: boolean; dataSource: string | null }[];

    powertrainType?: string | null;
    driveType?: string | null;
    manufacturerCo2?: number | null;
    torqueLbFt?: number | null;
    powerKw?: number | null;
    powerRpm?: number | null;

    ncapStarRating?: number | null;
    ncapChildPercent?: number | null;
    ncapAdultPercent?: number | null;
    ncapPedestrianPercent?: number | null;
    ncapSafetyAssistPercent?: number | null;

    isTeslaSuperchargerCompatible?: boolean;
    chargePorts?: {
      portType: string | null;
      locationOnVehicle: string | null;
      maxChargePowerKw: number | null;
      isStandardChargePort: boolean;
      chargeTimes: { chargePortKw: number; timeInMinutes: number }[];
    }[];
    batteries?: {
      locationOnVehicle: string | null;
      totalCapacityKwh: number | null;
      usableCapacityKwh: number | null;
      chemistry: string | null;
      warrantyMonths: number | null;
      warrantyMiles: number | null;
    }[];
    motors?: {
      motorType: string | null;
      manufacturer: string | null;
      model: string | null;
      motorLocation: string | null;
      powerKw: number | null;
      maxTorqueNm: number | null;
      axleDrivenByMotor: string | null;
      supportsRegenerativeBraking: boolean;
      additionalInformation: string | null;
    }[];
    evTransmissions?: { transmissionType: string | null; numberOfGears: number | null }[];
    evMaxChargeInputPowerKw?: number | null;
    evWhPerMile?: number | null;
    evRealRangeMiles?: number | null;
    evRealRangeKm?: number | null;
    evMilesPerChargeHour?: number | null;
    evZeroEmissionMiles?: number | null;
    evRangeTestCycles?: {
      testType: string | null;
      combinedRangeMiles: number | null;
      combinedRangeKm: number | null;
      cityRangeMiles: number | null;
      cityRangeKm: number | null;
    }[];
  } | null;
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
  error?: string;
}

// One glyph per VDI fact row, purely visual - mirrors BuyingGuideForm.tsx's
// own ICON map.
const ICON = {
  stolen: '🛡️',
  writeOff: '💥',
  finance: '💳',
  colour: '🎨',
  keeperChanges: '👤',
  plateChanges: '🔢',
  mileage: '🛣️',
  pnc: '🚓',
  identity: '🚗',
  registration: '📅',
  bodyType: '🚙',
  origin: '🌍',
  imported: '📦',
  scrapped: '♻️',
  tax: '🏛️',
  co2: '🌫️',
  weight: '⚖️',
  engine: '🔧',
  transmission: '⚙️',
  fuelTank: '⛽',
  performance: '🏁',
  torque: '💪',
  topSpeed: '🚀',
  soundLevel: '🔊',
  fuelEconomy: '📊',
  warranty: '🧾',
  ev: '⚡',
  chargePort: '🔌',
  battery: '🔋',
  motor: '🧲',
  range: '🗺️',
  ncap: '⭐',
} as const;

const CAR_CLASSES = Object.keys(CAR_CLASS_LABELS_FOR_BUYING_GUIDE) as CarSizeClass[];
const AGE_BANDS = Object.keys(CAR_AGE_BAND_LABELS) as AgeBand[];

function formatChargeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

type MotorEntry = NonNullable<NonNullable<CarBuyingGuideLookupResponse['vdiCheck']>['motors']>[number];

// The first motor gets a full detail card; every motor after it only
// lists the fields that actually differ (per the user's own explicit
// request) - a dual-motor AWD EV's front/rear motors are usually
// identical apart from location/axle, so repeating every field for each
// one would just be noise.
function motorDiffRows(motor: MotorEntry, reference: MotorEntry | null): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | number | boolean | null, refValue: string | number | boolean | null | undefined) => {
    if (value == null) return;
    if (reference && refValue === value) return;
    rows.push({ label, value: typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value) });
  };
  add('Type', motor.motorType, reference?.motorType);
  add('Manufacturer', motor.manufacturer, reference?.manufacturer);
  add('Model', motor.model, reference?.model);
  add('Power', motor.powerKw != null ? `${motor.powerKw}kW` : null, reference?.powerKw != null ? `${reference.powerKw}kW` : null);
  add('Max torque', motor.maxTorqueNm != null ? `${motor.maxTorqueNm}Nm` : null, reference?.maxTorqueNm != null ? `${reference.maxTorqueNm}Nm` : null);
  add('Axle driven', motor.axleDrivenByMotor, reference?.axleDrivenByMotor);
  add('Regenerative braking', motor.supportsRegenerativeBraking, reference?.supportsRegenerativeBraking);
  add('Notes', motor.additionalInformation, reference?.additionalInformation);
  return rows;
}

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
      const res = await fetch('/api/cars/buying-guide-vdi-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vrm: cleaned }),
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
                  "That report purchase has already been used - buy another to run it again."}
                {motResult.vdiCheckBlockedReason === 'payment_not_confirmed' &&
                  "We couldn't confirm that payment yet - please look up this registration again in a moment."}
                {motResult.vdiCheckBlockedReason === 'invalid' &&
                  "Something went wrong with that purchase - please buy again."}
                {motResult.vdiCheckBlockedReason === 'fetch_failed' &&
                  "Your payment went through, but we couldn't fetch the report just now - look up this registration again and it'll retry, at no extra cost."}
              </p>
              <button type="button" className="btn-primary" onClick={handleBuyVdiCheck} disabled={vdiPurchasing}>
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
              <div style={{ borderLeft: '3px solid var(--verdict-green)', paddingLeft: '0.6rem', marginBottom: '0.6rem' }}>
                <p className="field-note" style={{ fontWeight: 600, margin: 0 }}>
                  ✓ Vehicle history report
                  {motResult.vdiCheckPricePaidPence
                    ? ` - included with your £${(motResult.vdiCheckPricePaidPence / 100).toFixed(2)} purchase`
                    : ' - your free Premium report'}
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
              <p className="field-note" style={{ fontWeight: 600, margin: '0 0 0.3rem' }}>Safety &amp; history</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li className="field-note">{ICON.stolen} {motResult.vdiCheck.isStolen ? '⚠️ Recorded as stolen' : 'No stolen marker found'}</li>
                <li className="field-note">
                  {ICON.writeOff}{' '}
                  {motResult.vdiCheck.hasWriteOffRecord
                    ? `⚠️ ${motResult.vdiCheck.writeOffRecordCount} write-off record(s) on file`
                    : 'No write-off record found'}
                </li>
                <li className="field-note">
                  {ICON.finance}{' '}
                  {motResult.vdiCheck.hasOutstandingFinance
                    ? `⚠️ ${motResult.vdiCheck.financeRecords.length} outstanding finance agreement(s) on file`
                    : 'No outstanding finance found'}
                </li>
              </ul>

              {(motResult.vdiCheck.ncapStarRating != null || motResult.vdiCheck.ncapChildPercent != null ||
                motResult.vdiCheck.ncapAdultPercent != null || motResult.vdiCheck.ncapPedestrianPercent != null ||
                motResult.vdiCheck.ncapSafetyAssistPercent != null) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Euro NCAP safety rating</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.ncapStarRating != null && (
                      <li className="field-note">{ICON.ncap} Overall: {motResult.vdiCheck.ncapStarRating} / 5 stars</li>
                    )}
                    {motResult.vdiCheck.ncapAdultPercent != null && <li className="field-note">{ICON.ncap} Adult occupant: {motResult.vdiCheck.ncapAdultPercent}%</li>}
                    {motResult.vdiCheck.ncapChildPercent != null && <li className="field-note">{ICON.ncap} Child occupant: {motResult.vdiCheck.ncapChildPercent}%</li>}
                    {motResult.vdiCheck.ncapPedestrianPercent != null && <li className="field-note">{ICON.ncap} Pedestrian: {motResult.vdiCheck.ncapPedestrianPercent}%</li>}
                    {motResult.vdiCheck.ncapSafetyAssistPercent != null && <li className="field-note">{ICON.ncap} Safety assist: {motResult.vdiCheck.ncapSafetyAssistPercent}%</li>}
                  </ul>
                </>
              )}

              {(motResult.vdiCheck.series || motResult.vdiCheck.platformName || motResult.vdiCheck.countryOfOrigin ||
                motResult.vdiCheck.dvlaFuelType || motResult.vdiCheck.bodyStyle || motResult.vdiCheck.dvlaBodyType ||
                motResult.vdiCheck.dvlaWheelPlan || motResult.vdiCheck.dateFirstRegisteredInUk || motResult.vdiCheck.dateOfManufacture ||
                motResult.vdiCheck.powertrainType) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Identity</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.powertrainType && <li className="field-note">{ICON.ev} Powertrain type: {motResult.vdiCheck.powertrainType}</li>}
                    {motResult.vdiCheck.series && <li className="field-note">{ICON.identity} Series: {motResult.vdiCheck.series}</li>}
                    {motResult.vdiCheck.platformName && <li className="field-note">{ICON.identity} Platform: {motResult.vdiCheck.platformName}</li>}
                    {motResult.vdiCheck.countryOfOrigin && <li className="field-note">{ICON.origin} Country of origin: {motResult.vdiCheck.countryOfOrigin}</li>}
                    {motResult.vdiCheck.dvlaFuelType && <li className="field-note">{ICON.fuelTank} DVLA fuel type: {motResult.vdiCheck.dvlaFuelType}</li>}
                    {motResult.vdiCheck.bodyStyle && <li className="field-note">{ICON.bodyType} Body style: {motResult.vdiCheck.bodyStyle}</li>}
                    {motResult.vdiCheck.dvlaBodyType && <li className="field-note">{ICON.bodyType} DVLA body type: {motResult.vdiCheck.dvlaBodyType}</li>}
                    {motResult.vdiCheck.dvlaWheelPlan && <li className="field-note">{ICON.bodyType} Wheel plan: {motResult.vdiCheck.dvlaWheelPlan}</li>}
                    {motResult.vdiCheck.dateFirstRegisteredInUk && (
                      <li className="field-note">{ICON.registration} First registered in the UK: {new Date(motResult.vdiCheck.dateFirstRegisteredInUk).toLocaleDateString('en-GB')}</li>
                    )}
                    {motResult.vdiCheck.dateOfManufacture && (
                      <li className="field-note">{ICON.registration} Date of manufacture: {new Date(motResult.vdiCheck.dateOfManufacture).toLocaleDateString('en-GB')}</li>
                    )}
                  </ul>
                </>
              )}

              <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Colour</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li className="field-note">
                  {ICON.colour}{' '}
                  {motResult.vdiCheck.originalColour && motResult.vdiCheck.currentColour && motResult.vdiCheck.originalColour !== motResult.vdiCheck.currentColour
                    ? `${motResult.vdiCheck.originalColour.toLowerCase()} → ${motResult.vdiCheck.currentColour.toLowerCase()}`
                    : motResult.vdiCheck.currentColour
                      ? `Colour: ${motResult.vdiCheck.currentColour.toLowerCase()}`
                      : 'Colour not recorded'}
                  {' '}({motResult.vdiCheck.colourChangeCount} change(s) on record)
                  {motResult.vdiCheck.previousColour ? `, previously ${motResult.vdiCheck.previousColour.toLowerCase()}` : ''}
                </li>
              </ul>

              <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Ownership history</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                <li className="field-note">{ICON.keeperChanges} {motResult.vdiCheck.keeperChangeCount} keeper change(s) on record</li>
                {motResult.vdiCheck.keeperChanges.length > 0 && (() => {
                  const latest = motResult.vdiCheck.keeperChanges[motResult.vdiCheck.keeperChanges.length - 1];
                  return (
                    <li className="field-note">
                      {ICON.keeperChanges} Current keeper since {new Date(latest.keeperStartDate).toLocaleDateString('en-GB')}
                      {latest.numberOfPreviousKeepers != null ? ` (${latest.numberOfPreviousKeepers} previous keeper(s))` : ''}
                    </li>
                  );
                })()}
                <li className="field-note">{ICON.plateChanges} {motResult.vdiCheck.plateChangeCount} plate change(s) on record</li>
              </ul>

              {(motResult.vdiCheck.isImported || motResult.vdiCheck.isImportedFromOutsideEu || motResult.vdiCheck.isScrapped || motResult.vdiCheck.certificateOfDestructionIssued) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Status flags</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.isImported && (
                      <li className="field-note">{ICON.imported} Imported{motResult.vdiCheck.isImportedFromOutsideEu ? ' (from outside the EU)' : ''}</li>
                    )}
                    {motResult.vdiCheck.isScrapped && <li className="field-note">{ICON.scrapped} ⚠️ Recorded as scrapped</li>}
                    {motResult.vdiCheck.certificateOfDestructionIssued && (
                      <li className="field-note">{ICON.scrapped} ⚠️ Certificate of destruction issued</li>
                    )}
                  </ul>
                </>
              )}

              {(motResult.vdiCheck.vedStandardSixMonths != null || motResult.vdiCheck.vedStandardTwelveMonths != null ||
                motResult.vdiCheck.dvlaCo2 != null || motResult.vdiCheck.dvlaCo2Band || motResult.vdiCheck.euroStatus ||
                motResult.vdiCheck.manufacturerCo2 != null) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Running costs</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.vedStandardSixMonths != null && (
                      <li className="field-note">{ICON.tax} Road tax (6 months): £{motResult.vdiCheck.vedStandardSixMonths.toFixed(2)}</li>
                    )}
                    {motResult.vdiCheck.vedStandardTwelveMonths != null && (
                      <li className="field-note">{ICON.tax} Road tax (12 months): £{motResult.vdiCheck.vedStandardTwelveMonths.toFixed(2)}</li>
                    )}
                    {motResult.vdiCheck.dvlaCo2 != null && (
                      <li className="field-note">{ICON.co2} DVLA CO2: {motResult.vdiCheck.dvlaCo2} g/km{motResult.vdiCheck.dvlaCo2Band ? ` (band ${motResult.vdiCheck.dvlaCo2Band})` : ''}</li>
                    )}
                    {motResult.vdiCheck.manufacturerCo2 != null && (
                      <li className="field-note">{ICON.co2} Manufacturer-quoted CO2: {motResult.vdiCheck.manufacturerCo2} g/km</li>
                    )}
                    {motResult.vdiCheck.euroStatus && <li className="field-note">{ICON.co2} Euro status: {motResult.vdiCheck.euroStatus}</li>}
                  </ul>
                </>
              )}

              {(motResult.vdiCheck.cylinderArrangement || motResult.vdiCheck.numberOfCylinders != null || motResult.vdiCheck.aspiration ||
                motResult.vdiCheck.transmissionType || motResult.vdiCheck.numberOfGears != null || motResult.vdiCheck.drivingAxle ||
                motResult.vdiCheck.kerbWeightKg != null || motResult.vdiCheck.grossCombinedWeightKg != null || motResult.vdiCheck.fuelTankCapacityLitres != null) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Technical spec</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {(motResult.vdiCheck.numberOfCylinders != null || motResult.vdiCheck.cylinderArrangement) && (
                      <li className="field-note">
                        {ICON.engine} Engine: {[motResult.vdiCheck.cylinderArrangement, motResult.vdiCheck.numberOfCylinders != null ? `${motResult.vdiCheck.numberOfCylinders} cylinders` : null, motResult.vdiCheck.aspiration].filter(Boolean).join(', ')}
                      </li>
                    )}
                    {motResult.vdiCheck.transmissionType && (
                      <li className="field-note">
                        {ICON.transmission} Transmission: {[motResult.vdiCheck.transmissionType, motResult.vdiCheck.numberOfGears != null ? `${motResult.vdiCheck.numberOfGears}-speed` : null, motResult.vdiCheck.driveType, motResult.vdiCheck.drivingAxle ? `${motResult.vdiCheck.drivingAxle} drive` : null].filter(Boolean).join(', ')}
                      </li>
                    )}
                    {motResult.vdiCheck.kerbWeightKg != null && <li className="field-note">{ICON.weight} Kerb weight: {motResult.vdiCheck.kerbWeightKg.toLocaleString()} kg</li>}
                    {motResult.vdiCheck.grossCombinedWeightKg != null && <li className="field-note">{ICON.weight} Gross combined weight: {motResult.vdiCheck.grossCombinedWeightKg.toLocaleString()} kg</li>}
                    {motResult.vdiCheck.fuelTankCapacityLitres != null && <li className="field-note">{ICON.fuelTank} Fuel tank: {motResult.vdiCheck.fuelTankCapacityLitres} litres</li>}
                  </ul>
                </>
              )}

              {motResult.vdiCheck.batteries && motResult.vdiCheck.batteries.length > 0 && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Battery</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.batteries.map((b, i) => (
                      <li className="field-note" key={i}>
                        {ICON.battery}{' '}
                        {[
                          b.totalCapacityKwh != null ? `${b.totalCapacityKwh}kWh total` : null,
                          b.usableCapacityKwh != null ? `${b.usableCapacityKwh}kWh usable` : null,
                          b.chemistry,
                          b.locationOnVehicle,
                        ].filter(Boolean).join(', ')}
                        {(b.warrantyMonths != null || b.warrantyMiles != null) && (
                          <>
                            {' - battery warranty: '}
                            {[b.warrantyMonths ? `${b.warrantyMonths} months` : null, b.warrantyMiles ? `${b.warrantyMiles.toLocaleString()} miles` : null].filter(Boolean).join(' / ')}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {motResult.vdiCheck.motors && motResult.vdiCheck.motors.length > 0 && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Motor{motResult.vdiCheck.motors.length > 1 ? 's' : ''}</p>
                  {motResult.vdiCheck.motors.map((m, i) => {
                    const reference = i === 0 ? null : motResult.vdiCheck!.motors![0];
                    const rows = motorDiffRows(m, reference);
                    return (
                      <div key={i} style={{ marginBottom: i < motResult.vdiCheck!.motors!.length - 1 ? '0.4rem' : 0 }}>
                        <p className="field-note" style={{ margin: '0 0 0.15rem' }}>
                          {ICON.motor} Motor {i + 1}{m.motorLocation ? ` - ${m.motorLocation}` : ''}
                        </p>
                        {rows.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                            {rows.map((r, j) => (
                              <li className="field-note" key={j}>{r.label}: {r.value}</li>
                            ))}
                          </ul>
                        ) : (
                          i > 0 && <p className="field-note" style={{ margin: 0, paddingLeft: '1.1rem' }}>Same as Motor 1</p>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {motResult.vdiCheck.chargePorts && motResult.vdiCheck.chargePorts.length > 0 && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>
                    Charge port{motResult.vdiCheck.chargePorts.length > 1 ? 's' : ''}
                    {motResult.vdiCheck.isTeslaSuperchargerCompatible ? ' (Tesla Supercharger compatible)' : ''}
                  </p>
                  {motResult.vdiCheck.chargePorts.map((p, i) => (
                    <div key={i} style={{ marginBottom: '0.5rem' }}>
                      <p className="field-note" style={{ margin: '0 0 0.15rem' }}>
                        {ICON.chargePort} Charge port {i + 1} of {motResult.vdiCheck!.chargePorts!.length}:{' '}
                        {[p.portType, p.locationOnVehicle, p.maxChargePowerKw != null ? `max ${p.maxChargePowerKw}kW` : null, p.isStandardChargePort ? 'standard' : 'optional'].filter(Boolean).join(', ')}
                      </p>
                      {p.chargeTimes.length > 0 && (
                        <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '0.15rem 0.6rem 0.15rem 0', borderBottom: '1px solid var(--border)' }}>Charge rate</th>
                              <th style={{ textAlign: 'left', padding: '0.15rem 0', borderBottom: '1px solid var(--border)' }}>10-80% time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {p.chargeTimes.map((t, j) => (
                              <tr key={j}>
                                <td style={{ padding: '0.15rem 0.6rem 0.15rem 0' }} className="field-note">{t.chargePortKw}kW</td>
                                <td style={{ padding: '0.15rem 0' }} className="field-note">{formatChargeMinutes(t.timeInMinutes)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  ))}
                </>
              )}

              {(motResult.vdiCheck.bhp != null || motResult.vdiCheck.ps != null || motResult.vdiCheck.torqueNm != null ||
                motResult.vdiCheck.zeroToSixtyMph != null || motResult.vdiCheck.maxSpeedMph != null || motResult.vdiCheck.soundLevels) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Performance</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {(motResult.vdiCheck.bhp != null || motResult.vdiCheck.ps != null || motResult.vdiCheck.powerKw != null) && (
                      <li className="field-note">
                        {ICON.performance} Power: {[
                          motResult.vdiCheck.bhp != null ? `${motResult.vdiCheck.bhp} bhp` : null,
                          motResult.vdiCheck.ps != null ? `${motResult.vdiCheck.ps} PS` : null,
                          motResult.vdiCheck.powerKw != null ? `${motResult.vdiCheck.powerKw}kW` : null,
                        ].filter(Boolean).join(' / ')}
                        {motResult.vdiCheck.powerRpm != null ? ` at ${motResult.vdiCheck.powerRpm.toLocaleString()} rpm` : ''}
                      </li>
                    )}
                    {motResult.vdiCheck.torqueNm != null && (
                      <li className="field-note">
                        {ICON.torque} Torque: {motResult.vdiCheck.torqueNm} Nm
                        {motResult.vdiCheck.torqueLbFt != null ? ` (${motResult.vdiCheck.torqueLbFt} lb-ft)` : ''}
                        {motResult.vdiCheck.torqueRpm != null ? ` at ${motResult.vdiCheck.torqueRpm.toLocaleString()} rpm` : ''}
                      </li>
                    )}
                    {motResult.vdiCheck.zeroToSixtyMph != null && <li className="field-note">{ICON.topSpeed} 0-60mph: {motResult.vdiCheck.zeroToSixtyMph}s</li>}
                    {motResult.vdiCheck.zeroToOneHundredKph != null && <li className="field-note">{ICON.topSpeed} 0-100kph: {motResult.vdiCheck.zeroToOneHundredKph}s</li>}
                    {(motResult.vdiCheck.maxSpeedMph != null || motResult.vdiCheck.maxSpeedKph != null) && (
                      <li className="field-note">
                        {ICON.topSpeed} Max speed: {[motResult.vdiCheck.maxSpeedMph != null ? `${motResult.vdiCheck.maxSpeedMph}mph` : null, motResult.vdiCheck.maxSpeedKph != null ? `${motResult.vdiCheck.maxSpeedKph}kph` : null].filter(Boolean).join(' / ')}
                      </li>
                    )}
                    {motResult.vdiCheck.soundLevels && (motResult.vdiCheck.soundLevels.stationaryDb != null || motResult.vdiCheck.soundLevels.driveByDb != null) && (
                      <li className="field-note">
                        {ICON.soundLevel} Sound level:{' '}
                        {[
                          motResult.vdiCheck.soundLevels.stationaryDb != null ? `${motResult.vdiCheck.soundLevels.stationaryDb}dB stationary` : null,
                          motResult.vdiCheck.soundLevels.driveByDb != null
                            ? `${motResult.vdiCheck.soundLevels.driveByDb}dB drive-by${motResult.vdiCheck.soundLevels.engineSpeedRpm != null ? ` at ${motResult.vdiCheck.soundLevels.engineSpeedRpm.toLocaleString()} rpm` : ''}`
                            : null,
                        ].filter(Boolean).join(', ')}
                      </li>
                    )}
                  </ul>
                </>
              )}

              {(() => {
                const evT = motResult.vdiCheck!.evTransmissions;
                if (!evT || evT.length === 0) return null;
                // Only worth its own line when it actually adds something
                // beyond the top-level transmissionType/numberOfGears
                // already shown above - a single entry matching those is
                // a pure duplicate (see vdiUnlock.ts's own comment).
                const addsNewInfo =
                  evT.length > 1 ||
                  evT[0].transmissionType !== motResult.vdiCheck!.transmissionType ||
                  evT[0].numberOfGears !== motResult.vdiCheck!.numberOfGears;
                if (!addsNewInfo) return null;
                return (
                  <ul style={{ margin: '0.3rem 0 0', paddingLeft: '1.1rem' }}>
                    {evT.map((t, i) => (
                      <li className="field-note" key={i}>
                        {ICON.transmission} EV transmission {evT.length > 1 ? `${i + 1} of ${evT.length}` : ''}: {[t.transmissionType, t.numberOfGears != null ? `${t.numberOfGears}-speed` : null].filter(Boolean).join(', ')}
                      </li>
                    ))}
                  </ul>
                );
              })()}

              {(motResult.vdiCheck.evWhPerMile != null || motResult.vdiCheck.evMaxChargeInputPowerKw != null ||
                motResult.vdiCheck.evRealRangeMiles != null || motResult.vdiCheck.evMilesPerChargeHour != null ||
                motResult.vdiCheck.evZeroEmissionMiles != null || (motResult.vdiCheck.evRangeTestCycles && motResult.vdiCheck.evRangeTestCycles.length > 0)) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>EV performance &amp; range</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.evWhPerMile != null && <li className="field-note">{ICON.ev} Efficiency: {motResult.vdiCheck.evWhPerMile}Wh/mile</li>}
                    {motResult.vdiCheck.evMaxChargeInputPowerKw != null && <li className="field-note">{ICON.chargePort} Max charge input power: {motResult.vdiCheck.evMaxChargeInputPowerKw}kW</li>}
                    {motResult.vdiCheck.evZeroEmissionMiles != null && <li className="field-note">{ICON.range} Zero-emission range: {motResult.vdiCheck.evZeroEmissionMiles} miles</li>}
                    {motResult.vdiCheck.evRealRangeMiles != null && (
                      <li className="field-note">
                        {ICON.range} Real-world range: {motResult.vdiCheck.evRealRangeMiles} miles{motResult.vdiCheck.evRealRangeKm != null ? ` (${motResult.vdiCheck.evRealRangeKm}km)` : ''}
                      </li>
                    )}
                    {motResult.vdiCheck.evMilesPerChargeHour != null && <li className="field-note">{ICON.range} Miles added per hour of charge: {motResult.vdiCheck.evMilesPerChargeHour}</li>}
                    {motResult.vdiCheck.evRangeTestCycles?.map((c, i) => (
                      <li className="field-note" key={i}>
                        {ICON.range} {c.testType ?? 'Test cycle'} range:{' '}
                        {[
                          c.combinedRangeMiles != null ? `${c.combinedRangeMiles} miles combined` : null,
                          c.combinedRangeKm != null ? `(${c.combinedRangeKm}km)` : null,
                          c.cityRangeMiles != null ? `${c.cityRangeMiles} miles city` : null,
                        ].filter(Boolean).join(' ')}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {motResult.vdiCheck.fuelEconomy && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Fuel economy</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.fuelEconomy.urbanColdMpg != null && (
                      <li className="field-note">{ICON.fuelEconomy} Urban (cold): {motResult.vdiCheck.fuelEconomy.urbanColdMpg}mpg ({motResult.vdiCheck.fuelEconomy.urbanColdL100Km}L/100km)</li>
                    )}
                    {motResult.vdiCheck.fuelEconomy.extraUrbanMpg != null && (
                      <li className="field-note">{ICON.fuelEconomy} Extra urban: {motResult.vdiCheck.fuelEconomy.extraUrbanMpg}mpg ({motResult.vdiCheck.fuelEconomy.extraUrbanL100Km}L/100km)</li>
                    )}
                    {motResult.vdiCheck.fuelEconomy.combinedMpg != null && (
                      <li className="field-note">{ICON.fuelEconomy} Combined: {motResult.vdiCheck.fuelEconomy.combinedMpg}mpg ({motResult.vdiCheck.fuelEconomy.combinedL100Km}L/100km)</li>
                    )}
                  </ul>
                </>
              )}

              {motResult.vdiCheck.pncDetail && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Police National Computer record</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {motResult.vdiCheck.pncDetail.policeForceName && <li className="field-note">{ICON.pnc} Police force: {motResult.vdiCheck.pncDetail.policeForceName}</li>}
                    {motResult.vdiCheck.pncDetail.currentStatusOnRecord && <li className="field-note">{ICON.pnc} Current status: {motResult.vdiCheck.pncDetail.currentStatusOnRecord}</li>}
                    {motResult.vdiCheck.pncDetail.dateReportedStolen && (
                      <li className="field-note">{ICON.pnc} Reported stolen: {new Date(motResult.vdiCheck.pncDetail.dateReportedStolen).toLocaleDateString('en-GB')}</li>
                    )}
                    {motResult.vdiCheck.pncDetail.dateRecordAddedToPnc && (
                      <li className="field-note">{ICON.pnc} Added to PNC: {new Date(motResult.vdiCheck.pncDetail.dateRecordAddedToPnc).toLocaleDateString('en-GB')}</li>
                    )}
                  </ul>
                </>
              )}

              <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Mileage integrity</p>
              <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {motResult.vdiCheck.calculatedAverageAnnualMileage != null && motResult.vdiCheck.averageMileageForAge != null && (
                  <li className="field-note">
                    {ICON.mileage} Average annual mileage: {motResult.vdiCheck.calculatedAverageAnnualMileage.toLocaleString()} mi/year
                    (typical for this age: {motResult.vdiCheck.averageMileageForAge.toLocaleString()})
                    {motResult.vdiCheck.mileageAnomalyDetected ? ' - ⚠️ anomaly flagged' : ''}
                  </li>
                )}
              </ul>
              {motResult.vdiCheck.mileageReadings && <VdiMileageChart readings={motResult.vdiCheck.mileageReadings} />}

              {(motResult.vdiCheck.manufacturerWarrantyMonths != null || motResult.vdiCheck.manufacturerWarrantyMiles != null) && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Manufacturer warranty</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    <li className="field-note">
                      {ICON.warranty}{' '}
                      {[
                        motResult.vdiCheck.manufacturerWarrantyMonths ? `${motResult.vdiCheck.manufacturerWarrantyMonths} months` : null,
                        motResult.vdiCheck.manufacturerWarrantyMiles ? `${motResult.vdiCheck.manufacturerWarrantyMiles.toLocaleString()} miles` : null,
                      ]
                        .filter(Boolean)
                        .join(' / ')}{' '}
                      from new
                    </li>
                  </ul>
                </>
              )}

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

              {motResult.vdiCheck.plateChanges && motResult.vdiCheck.plateChanges.length > 0 && (
                <>
                  <p className="field-note" style={{ fontWeight: 600, margin: '0.6rem 0 0.3rem' }}>Plate change history</p>
                  <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                    {[...motResult.vdiCheck.plateChanges].reverse().map((p, i) => (
                      <li key={i} className="field-note">
                        {p.previousVrm ?? '?'} → {p.currentVrm ?? '?'}
                        {p.dateOfTransaction ? ` (${new Date(p.dateOfTransaction).toLocaleDateString('en-GB')})` : ''}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {motResult && (
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
