// Place at: src/app/dashboard/AddCarForm.tsx
//
// Car equivalent of AddBikeForm.tsx. Two deliberate simplifications
// versus the motorcycle version, both scope cuts already documented in
// RoadVerdict_Car_Plan_v3.md:
// - No curated make/model list (none exists for cars - VDG's returned
//   make/model strings go straight into free-text fields, so there's no
//   "matched in our list" vs "custom entry" branching to do at all).
// - No MOT-mileage-floor prefill and no post-create MOT import - both
//   routes (mot-history-preview, mot-history) are bike-only today; a car
//   equivalent is real, separate work, not attempted here.
// - No "request ownership" flow for an already-tracked car - car
//   ownership transfer isn't built (see the ADR). A duplicate plate on
//   another account can still be started fresh under this one.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REGION_LABELS, type Region } from '@/lib/priceData';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

const REGIONS = Object.keys(REGION_LABELS) as Region[];

type CarFuelType = 'petrol' | 'diesel' | 'hybrid' | 'phev' | 'electric';

const FUEL_TYPE_LABELS: Record<CarFuelType, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  hybrid: 'Hybrid',
  phev: 'Plug-in hybrid (PHEV)',
  electric: 'Electric',
};

// Best-effort only, from DVLA's own free-text fuel description on the
// plate lookup - always left editable, same "AI/heuristic guesses,
// human always corrects" convention this app uses everywhere else.
// DVLA doesn't distinguish plain hybrid from plug-in hybrid in this
// field, so a PHEV will land on 'hybrid' here and needs a manual fix.
function mapDvlaFuelType(raw: string): CarFuelType | null {
  const v = raw.toUpperCase();
  if (v.includes('HYBRID')) return 'hybrid';
  if (v === 'ELECTRICITY' || v.includes('ELECTRIC')) return 'electric';
  if (v.includes('DIESEL')) return 'diesel';
  if (v.includes('PETROL') || v.includes('GAS')) return 'petrol';
  return null;
}

export function AddCarForm() {
  const [fuelType, setFuelType] = useState<CarFuelType>('petrol');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [engineLitres, setEngineLitres] = useState('');
  const [batteryKwh, setBatteryKwh] = useState('');
  const [isCustomBuild, setIsCustomBuild] = useState(false);
  const [year, setYear] = useState('');
  const [registration, setRegistration] = useState('');
  const [mileage, setMileage] = useState('');
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/cars/car');

  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
  const [existingCar, setExistingCar] = useState<{ status: 'own' | 'other'; carId?: string } | null>(null);
  const [switchingCar, setSwitchingCar] = useState(false);
  const [startedFreshDespiteDuplicate, setStartedFreshDespiteDuplicate] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const router = useRouter();

  const needsEngineLitres = fuelType !== 'electric';
  const yearRequired = !isCustomBuild && fuelType !== 'electric';

  async function handleGoToExistingCar(carId: string) {
    setSwitchingCar(true);
    try {
      const res = await fetch('/api/cars/active-car', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carId }),
      });
      if (!res.ok) {
        setLookupMessage({ text: "Couldn't switch to that car. Try again.", tone: 'error' });
        setSwitchingCar(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch {
      setLookupMessage({ text: "Couldn't reach the server. Try again.", tone: 'error' });
      setSwitchingCar(false);
    }
  }

  async function handleLookup() {
    if (!registration.trim()) {
      setLookupMessage({ text: 'Enter a registration number first.', tone: 'error' });
      return;
    }
    setLookingUp(true);
    setLookupMessage(null);
    setExistingCar(null);
    setStartedFreshDespiteDuplicate(false);
    try {
      const res = await fetch(`/api/tracker/plate-lookup?vrm=${encodeURIComponent(registration.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMessage({ text: data.error ?? 'No vehicle found for that registration - enter details manually below.', tone: 'error' });
        return;
      }

      // The reverse of AddBikeForm's own gate - a genuine motorcycle
      // stops here rather than being logged as a car. 'four-wheeled' and
      // 'unknown' both proceed (the same as AddBikeForm treats
      // 'motorcycle' as its one accepted case) - VDG's classifier covers
      // vans/trucks/etc under the same 'four-wheeled' bucket, and an
      // uncertain result shouldn't block someone entering real details
      // manually.
      if (data.vehicleType === 'motorcycle') {
        setLookupMessage({ text: "That looks like a motorcycle, not a car - you can track it from your bike dashboard instead.", tone: 'error' });
        return;
      }

      const dupRes = await fetch(`/api/cars/car-exists?registration=${encodeURIComponent(registration.trim())}`);
      const dupData = await dupRes.json();
      if (dupRes.ok && dupData.exists) {
        setExistingCar(
          dupData.belongsToCurrentUser ? { status: 'own', carId: dupData.carId } : { status: 'other' }
        );
        return;
      }

      setMake(String(data.make ?? ''));
      setModel(String(data.model ?? ''));
      if (data.year && !isCustomBuild) setYear(String(data.year));
      if (data.engineCapacityCc) setEngineLitres(String(Math.round((data.engineCapacityCc / 1000) * 10) / 10));
      const guessedFuelType = mapDvlaFuelType(String(data.fuelType ?? ''));
      if (guessedFuelType) setFuelType(guessedFuelType);

      const parts = [`Filled in from the registration: ${data.make} ${data.model}${data.year ? ` (${data.year})` : ''}.`];
      if (guessedFuelType === 'hybrid' && String(data.fuelType ?? '').toUpperCase().includes('HYBRID')) {
        parts.push("Fuel type guessed as Hybrid from DVLA's record - change it to Plug-in hybrid below if that's what this actually is, DVLA doesn't distinguish the two.");
      }
      if (data.plateInRetention) {
        parts.push("Note: this plate is currently in retention (not on any vehicle right now) - the details shown are from the last vehicle it was recorded against, so double-check they're actually right for this car.");
      }
      setLookupMessage({ text: parts.join(' '), tone: 'ok' });
    } catch {
      setLookupMessage({ text: "Couldn't reach the lookup service - enter details manually below.", tone: 'error' });
    } finally {
      setLookingUp(false);
    }
  }

  function handleStartFresh() {
    setExistingCar(null);
    setStartedFreshDespiteDuplicate(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!make.trim()) {
      setFormError('Enter the make.');
      return;
    }
    if (!model.trim()) {
      setFormError('Enter the model.');
      return;
    }
    if (needsEngineLitres && !(Number(engineLitres) > 0)) {
      setFormError('Enter a valid engine size in litres.');
      return;
    }
    if (yearRequired && !year) {
      setFormError('Enter the production year, or mark this as a custom build.');
      return;
    }
    if (!registration.trim()) {
      setFormError('Enter the registration number.');
      return;
    }
    if (!(Number(mileage) >= 0)) {
      setFormError('Enter the current mileage.');
      return;
    }

    await submit({
      make: make.trim(),
      model: model.trim(),
      fuelType,
      engineLitres: needsEngineLitres ? Number(engineLitres) : undefined,
      batteryKwh: batteryKwh ? Number(batteryKwh) : undefined,
      year: yearRequired ? Number(year) : undefined,
      isCustomBuild,
      registration,
      currentMileage: Number(mileage),
      nickname,
      region,
      mayHavePriorHistory: startedFreshDespiteDuplicate,
    });
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Add your car</span>
        <div className="field">
          <label htmlFor="car-fuel-type">Fuel type</label>
          <select id="car-fuel-type" value={fuelType} onChange={(e) => setFuelType(e.target.value as CarFuelType)}>
            {(Object.keys(FUEL_TYPE_LABELS) as CarFuelType[]).map((f) => (
              <option key={f} value={f}>{FUEL_TYPE_LABELS[f]}</option>
            ))}
          </select>
          <p className="field-note" style={{ marginTop: '0.4rem' }}>
            Decides what shows up when logging fuel later - litres for anything with an engine, or a charge in kWh for electric.
          </p>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-make">Make</label>
          <input id="car-make" type="text" value={make} onChange={(e) => setMake(e.target.value)} placeholder="e.g. Ford" />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-model">Model</label>
          <input id="car-model" type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. Focus" />
        </div>
        {needsEngineLitres && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="car-engine-litres">Engine size (litres)</label>
            <input id="car-engine-litres" type="number" min="0.1" step="0.1" value={engineLitres} onChange={(e) => setEngineLitres(e.target.value)} placeholder="e.g. 1.6" />
          </div>
        )}
        {(fuelType === 'electric' || fuelType === 'phev') && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="car-battery-kwh">Battery size (kWh, optional)</label>
            <input id="car-battery-kwh" type="number" min="0" step="0.1" value={batteryKwh} onChange={(e) => setBatteryKwh(e.target.value)} placeholder="e.g. 64" />
          </div>
        )}
        <div className="field-checkbox" style={{ marginTop: '0.9rem' }}>
          <label>
            <input type="checkbox" checked={isCustomBuild} onChange={(e) => setIsCustomBuild(e.target.checked)} />
            This is a custom build (no single production year applies)
          </label>
        </div>
        {yearRequired && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="car-year">Year</label>
            <input id="car-year" type="number" min="1990" max="2026" value={year} onChange={(e) => setYear(e.target.value)} required />
          </div>
        )}
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-registration">Registration number</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <input
              id="car-registration"
              type="text"
              placeholder="ENTER REG"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              required
              className={styles.regPlateInput}
              style={{ flex: 1 }}
            />
            <button type="button" className={styles.iconBtn} disabled={lookingUp} onClick={handleLookup}>
              {lookingUp ? 'Looking up…' : 'Look up'}
            </button>
          </div>
          {lookupMessage && (
            <p
              className={lookupMessage.tone === 'error' ? 'error-text' : 'field-note'}
              role={lookupMessage.tone === 'error' ? 'alert' : undefined}
              style={{ marginTop: '0.4rem', color: lookupMessage.tone === 'warn' ? 'var(--verdict-red)' : undefined }}
            >
              {lookupMessage.text}
            </p>
          )}
          {existingCar?.status === 'own' && (
            <div className={styles.card} style={{ marginTop: '0.6rem' }}>
              <p className="field-note">You&apos;ve already added this car to your account.</p>
              <button
                type="button"
                className="btn-primary"
                disabled={switchingCar}
                onClick={() => existingCar.carId && handleGoToExistingCar(existingCar.carId)}
                style={{ marginTop: '0.5rem' }}
              >
                {switchingCar ? 'Switching…' : 'Go to this car'}
              </button>
            </div>
          )}
          {existingCar?.status === 'other' && (
            <div className={styles.card} style={{ marginTop: '0.6rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>This car is already tracked on a different account.</p>
              <p className="field-note">
                Ownership requests aren&apos;t available for cars yet. If this is genuinely your car, you can still
                start a fresh record under your own account.
              </p>
              <button type="button" className="btn-secondary" style={{ marginTop: '0.5rem' }} onClick={handleStartFresh}>
                Start fresh
              </button>
            </div>
          )}
          <p className="field-note" style={{ marginTop: '0.4rem' }}>
            This is recorded permanently as this car&apos;s original registration and can&apos;t be removed later - only
            added to, if the plate genuinely changes (e.g. a private plate).
          </p>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-mileage">Current mileage</label>
          <input id="car-mileage" type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-region">Where you keep and run it</label>
          <select id="car-region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{REGION_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-nickname">Nickname (optional)</label>
          <input id="car-nickname" type="text" placeholder="e.g. The Runabout" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add car'}
        </button>
        {formError && <p className="error-text" role="alert">{formError}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
