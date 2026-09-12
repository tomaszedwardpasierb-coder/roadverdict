// Place at: src/app/dashboard/AddCarForm.tsx
//
// Car equivalent of AddBikeForm.tsx. One deliberate simplification
// versus the motorcycle version remains, documented in
// RoadVerdict_Car_Plan_v3.md:
// - CAR_MODELS carries no engine-size/fuel-type per entry (unlike
//   MotorcycleModel's engineCC) - a single nameplate spans every fuel
//   type over its production run, so selecting a model never auto-fills
//   engine size the way picking a bike model does; engineLitres stays a
//   plain user-entered field regardless of match status.
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import { ALL_CAR_BRANDS, CAR_MODELS } from '@/lib/carModels';
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

const OTHER = '__other__';

export function AddCarForm() {
  const [fuelType, setFuelType] = useState<CarFuelType>('petrol');
  const [make, setMake] = useState(ALL_CAR_BRANDS[0]);
  const modelsForBrand = CAR_MODELS.filter((m) => m.make === make);
  const [model, setModel] = useState(modelsForBrand[0]?.model ?? '');
  const [customMake, setCustomMake] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [engineLitres, setEngineLitres] = useState('');
  const [batteryKwh, setBatteryKwh] = useState('');
  const [isCustomBuild, setIsCustomBuild] = useState(false);
  const [year, setYear] = useState('');
  const [registration, setRegistration] = useState('');
  const [mileage, setMileage] = useState('');
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const { submit, submitting, error, lastResponse } = useTrackerFormSubmit('/api/cars/car');

  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
  const [existingCar, setExistingCar] = useState<{ status: 'own' | 'other'; carId?: string } | null>(null);
  const [switchingCar, setSwitchingCar] = useState(false);
  const [requestingOwnership, setRequestingOwnership] = useState(false);
  const [ownershipRequestSent, setOwnershipRequestSent] = useState(false);
  const [ownershipRequestError, setOwnershipRequestError] = useState<string | null>(null);
  const [startedFreshDespiteDuplicate, setStartedFreshDespiteDuplicate] = useState(false);
  const [pendingLookupData, setPendingLookupData] = useState<{ make?: string; model?: string; year?: number; engineCapacityCc?: number; fuelType?: string; plateInRetention?: boolean } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [minMileage, setMinMileage] = useState<number | null>(null);
  const [minMileageDate, setMinMileageDate] = useState<string | null>(null);
  const [mileageConfirmed, setMileageConfirmed] = useState(false);
  const router = useRouter();

  const isCustomMake = make === OTHER;
  const isCustomModel = model === OTHER;
  const effectiveMake = isCustomMake ? customMake.trim() : make;
  const effectiveModel = isCustomModel ? customModel.trim() : model;
  const needsEngineLitres = fuelType !== 'electric';
  const yearRequired = !isCustomBuild && fuelType !== 'electric';

  function handleMakeChange(newMake: string) {
    setMake(newMake);
    if (newMake === OTHER) {
      setModel(OTHER);
      return;
    }
    const firstModel = CAR_MODELS.find((m) => m.make === newMake);
    setModel(firstModel?.model ?? '');
  }

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

  // Runs the make/model matching, fuel-type guess, and MOT-mileage-floor
  // auto-fill against an already-fetched plate-lookup response. Split out
  // from handleLookup so "Start fresh" can call this exact same logic on
  // data that's already in hand, without a second network round-trip.
  async function applyLookupData(data: { make?: string; model?: string; year?: number; engineCapacityCc?: number; fuelType?: string; plateInRetention?: boolean }) {
    const matchedBrand = ALL_CAR_BRANDS.find((b) => b.toLowerCase() === String(data.make ?? '').toLowerCase());
    let matchedModelName: string | null = null;
    if (matchedBrand) {
      handleMakeChange(matchedBrand);
      const candidates = CAR_MODELS.filter((m) => m.make === matchedBrand);
      const dvlaModel = String(data.model ?? '').toLowerCase();
      const exact = candidates.find((m) => m.model.toLowerCase() === dvlaModel);
      const partial = candidates.find(
        (m) => dvlaModel.includes(m.model.toLowerCase()) || m.model.toLowerCase().includes(dvlaModel)
      );
      const found = exact ?? partial;
      if (found) {
        setModel(found.model);
        matchedModelName = found.model;
      } else {
        // Make matched but the specific model isn't in our curated list -
        // drop straight into the custom-entry field pre-filled with the
        // real returned data, rather than making the user retype it.
        setModel(OTHER);
        setCustomModel(String(data.model ?? ''));
      }
    } else {
      setMake(OTHER);
      setCustomMake(String(data.make ?? ''));
      setModel(OTHER);
      setCustomModel(String(data.model ?? ''));
    }

    if (data.year && !isCustomBuild) setYear(String(data.year));
    if (data.engineCapacityCc) setEngineLitres(String(Math.round((data.engineCapacityCc / 1000) * 10) / 10));
    const guessedFuelType = mapDvlaFuelType(String(data.fuelType ?? ''));
    if (guessedFuelType) setFuelType(guessedFuelType);

    // Independent of whether make/model matched above - a genuine mileage
    // floor from DVSA's own records is worth having even for a car not in
    // our curated list at all. Failure here is silent and non-blocking:
    // the vehicle lookup already succeeded, this is a bonus, and "no MOT
    // history yet" (a car under 3 years old) is a completely normal,
    // expected outcome, not an error. Reuses the same, already
    // vehicle-agnostic /api/tracker/mot-history-preview endpoint bikes use.
    try {
      const motRes = await fetch(`/api/tracker/mot-history-preview?vrm=${encodeURIComponent(registration.trim())}`);
      if (motRes.ok) {
        const motData = await motRes.json();
        if (motData.latestTrustedMileage != null) {
          setMinMileage(motData.latestTrustedMileage);
          setMinMileageDate(motData.latestTestDate ?? null);
          setMileage(String(motData.latestTrustedMileage));
          setMileageConfirmed(false);
        }
      }
    } catch {
      // Silent, non-blocking - see comment above.
    }

    const parts: string[] = [];
    if (matchedBrand && matchedModelName) {
      parts.push(`Matched to ${matchedBrand} ${matchedModelName} in our list.`);
    } else if (matchedBrand) {
      parts.push(`Matched the make (${matchedBrand}). "${data.model}" isn't in our model list, so it's been filled in below as a custom entry - check it over, or pick a listed model instead if you'd rather.`);
    } else {
      parts.push(`Found "${data.make} ${data.model}" - not in our make list at all, so both have been filled in below as a custom entry. Check the details before submitting.`);
    }
    if (guessedFuelType === 'hybrid' && String(data.fuelType ?? '').toUpperCase().includes('HYBRID')) {
      parts.push("Fuel type guessed as Hybrid from DVLA's record - change it to Plug-in hybrid below if that's what this actually is, DVLA doesn't distinguish the two.");
    }
    if (data.plateInRetention) {
      parts.push("Note: this plate is currently in retention (not on any vehicle right now) - the details shown are from the last vehicle it was recorded against, so double-check they're actually right for this car.");
    }
    setLookupMessage({ text: parts.join(' '), tone: matchedBrand && matchedModelName ? 'ok' : 'warn' });
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
        setPendingLookupData(data);
        return;
      }

      await applyLookupData(data);
    } catch {
      setLookupMessage({ text: "Couldn't reach the lookup service - enter details manually below.", tone: 'error' });
    } finally {
      setLookingUp(false);
    }
  }

  async function handleStartFresh() {
    setExistingCar(null);
    setStartedFreshDespiteDuplicate(true);
    if (pendingLookupData) {
      await applyLookupData(pendingLookupData);
    }
  }

  async function handleRequestOwnership() {
    setRequestingOwnership(true);
    setOwnershipRequestError(null);
    try {
      const res = await fetch('/api/cars/car-transfer/request-ownership', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registration: registration.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOwnershipRequestError(data.error ?? 'Could not send the request. Try again.');
        return;
      }
      setOwnershipRequestSent(true);
    } catch {
      setOwnershipRequestError("Couldn't reach the server. Try again.");
    } finally {
      setRequestingOwnership(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (isCustomMake && !customMake.trim()) {
      setFormError('Enter the make.');
      return;
    }
    if (isCustomModel && !customModel.trim()) {
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
    if (minMileage !== null) {
      if (!(Number(mileage) >= minMileage)) {
        setFormError(`Current mileage has to be at least ${minMileage.toLocaleString()} miles - that's what your last MOT recorded.`);
        return;
      }
      if (!mileageConfirmed) {
        setFormError('Please confirm the current mileage figure before adding the car.');
        return;
      }
    }

    const ok = await submit({
      make: effectiveMake,
      model: effectiveModel,
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
    // Best-effort, non-blocking - the car itself is already saved
    // successfully regardless of what happens here. If this fails
    // silently (no MOT history for this plate, service hiccup, etc.),
    // the car still exists and MOT import can always be run again later.
    if (ok) {
      const newCarId = (lastResponse.current as { car?: { id?: string } } | null)?.car?.id;
      if (newCarId) {
        try {
          await fetch('/api/cars/car/mot-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ carId: newCarId }),
          });
        } catch {
          // Silent - see comment above.
        }
      }
    }
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
          <select id="car-make" value={make} onChange={(e) => handleMakeChange(e.target.value)}>
            {ALL_CAR_BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
            <option value={OTHER}>Other / not in this list</option>
          </select>
        </div>
        {isCustomMake ? (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="car-custom-make">Make (enter manually)</label>
            <input id="car-custom-make" type="text" value={customMake} onChange={(e) => setCustomMake(e.target.value)} placeholder="e.g. Genesis" />
          </div>
        ) : (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="car-model">Model</label>
            <select id="car-model" value={model} onChange={(e) => setModel(e.target.value)}>
              {modelsForBrand.map((m) => (
                <option key={m.model} value={m.model}>{m.model}</option>
              ))}
              <option value={OTHER}>Other / not in this list</option>
            </select>
          </div>
        )}
        {isCustomModel && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="car-custom-model">Model (enter manually)</label>
            <input id="car-custom-model" type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="e.g. GV70" />
          </div>
        )}
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
              {lookingUp && <VehicleSpinner kind="car" size={20} />}
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
                {switchingCar && <VehicleSpinner kind="car" size={20} />}
                {switchingCar ? 'Switching…' : 'Go to this car'}
              </button>
            </div>
          )}
          {existingCar?.status === 'other' && (
            <div className={styles.card} style={{ marginTop: '0.6rem' }}>
              <p style={{ fontWeight: 600, marginBottom: '0.3rem' }}>This car already has a RoadVerdict history.</p>
              {ownershipRequestSent ? (
                <p className="field-note">
                  Request sent. If the current owner approves it, this car&apos;s history moves to your account and
                  you&apos;ll get an email either way.
                </p>
              ) : (
                <>
                  <p className="field-note">
                    This car has previously been registered with RoadVerdict. If you&apos;ve bought it, you can
                    request ownership and continue building its existing history.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={requestingOwnership}
                      onClick={handleRequestOwnership}
                    >
                      {requestingOwnership && <VehicleSpinner kind="car" size={20} />}
                      {requestingOwnership ? 'Sending…' : 'Request ownership'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={handleStartFresh}>
                      Start fresh, without requesting
                    </button>
                  </div>
                  <p className="field-note" style={{ marginTop: '0.5rem' }}>
                    Starting fresh begins a brand new record for this car under your account - the previous
                    owner&apos;s logged history stays on theirs, and won&apos;t be included.
                  </p>
                  {ownershipRequestError && (
                    <p className="error-text" role="alert" style={{ marginTop: '0.6rem' }}>
                      {ownershipRequestError}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <p className="field-note" style={{ marginTop: '0.4rem' }}>
            This is recorded permanently as this car&apos;s original registration and can&apos;t be removed later - only
            added to, if the plate genuinely changes (e.g. a private plate).
          </p>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="car-mileage">Current mileage</label>
          <input
            id="car-mileage"
            type="number"
            min={minMileage ?? 0}
            value={mileage}
            onChange={(e) => { setMileage(e.target.value); setMileageConfirmed(false); }}
            required
          />
          {minMileage !== null && (
            <>
              <p className="field-note" style={{ marginTop: '0.4rem' }}>
                Your last MOT{minMileageDate ? ` (${new Date(minMileageDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''} recorded {minMileage.toLocaleString()} miles - current mileage has to be at least this.
              </p>
              <div className="field-checkbox" style={{ marginTop: '0.4rem' }}>
                <label>
                  <input type="checkbox" checked={mileageConfirmed} onChange={(e) => setMileageConfirmed(e.target.checked)} />
                  I confirm this mileage is correct, or I&apos;ve updated it to the car&apos;s real current reading
                </label>
              </div>
            </>
          )}
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
          {submitting && <VehicleSpinner kind="car" size={20} />}
          {submitting ? 'Adding…' : 'Add car'}
        </button>
        {formError && <p className="error-text" role="alert">{formError}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
