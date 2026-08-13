// Place at: src/app/dashboard/AddBikeForm.tsx
'use client';

import { useState } from 'react';
import { ALL_BRANDS, MOTORCYCLE_MODELS, getBikeClassForCC } from '@/lib/motorcycleModels';
import { REGION_LABELS, type Region } from '@/lib/priceData';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

const REGIONS = Object.keys(REGION_LABELS) as Region[];

export function AddBikeForm() {
  const [make, setMake] = useState(ALL_BRANDS[0]);
  const modelsForBrand = MOTORCYCLE_MODELS.filter((m) => m.make === make);
  const [model, setModel] = useState(modelsForBrand[0]?.model ?? '');
  const [year, setYear] = useState('');
  const [isCustomBuild, setIsCustomBuild] = useState(false);
  const [registration, setRegistration] = useState('');
  const [mileage, setMileage] = useState('');
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const { submit, submitting, error, lastResponse } = useTrackerFormSubmit('/api/tracker/bike');

  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);
  const [customMake, setCustomMake] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [customEngineCC, setCustomEngineCC] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [minMileage, setMinMileage] = useState<number | null>(null);
  const [minMileageDate, setMinMileageDate] = useState<string | null>(null);
  const [mileageConfirmed, setMileageConfirmed] = useState(false);

  const OTHER = '__other__';

  function handleMakeChange(newMake: string) {
    setMake(newMake);
    if (newMake === OTHER) {
      setModel(OTHER);
      return;
    }
    const firstModel = MOTORCYCLE_MODELS.find((m) => m.make === newMake);
    setModel(firstModel?.model ?? '');
  }

  // Best-effort match against the curated make/model list - VDLA/VDG text
  // is free-form and won't always line up exactly with what's in
  // motorcycleModels.ts. Make is matched case-insensitively; model first
  // tries an exact case-insensitive match within that make, then falls
  // back to a substring check either direction (curated names are often
  // short forms of the fuller DVLA/VDG string, e.g. "Interceptor 650" vs
  // "INTERCEPTOR 650 TWIN"). No match found for either is a real,
  // expected outcome (bike not in the curated list at all) - not a bug,
  // handled explicitly below rather than silently failing.
  async function handleLookup() {
    if (!registration.trim()) {
      setLookupMessage({ text: 'Enter a registration number first.', tone: 'error' });
      return;
    }
    setLookingUp(true);
    setLookupMessage(null);
    try {
      const res = await fetch(`/api/tracker/plate-lookup?vrm=${encodeURIComponent(registration.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setLookupMessage({ text: data.error ?? 'No vehicle found for that registration - enter details manually below.', tone: 'error' });
        return;
      }

      const matchedBrand = ALL_BRANDS.find((b) => b.toLowerCase() === String(data.make ?? '').toLowerCase());
      let matchedModelName: string | null = null;
      if (matchedBrand) {
        handleMakeChange(matchedBrand);
        const candidates = MOTORCYCLE_MODELS.filter((m) => m.make === matchedBrand);
        const dvlaModel = String(data.model ?? '').toLowerCase();
        const exact = candidates.find((m) => m.model.toLowerCase() === dvlaModel);
        const partial = candidates.find(
          (m) => dvlaModel.includes(m.model.toLowerCase()) || m.model.toLowerCase().includes(dvlaModel)
        );
        const found = exact ?? partial;
        if (found) {
          setModel(found.model);
          matchedModelName = found.model;
        }
      }

      if (data.year && !isCustomBuild) {
        setYear(String(data.year));
      }

      // Independent of whether make/model matched above - a genuine
      // mileage floor from DVSA's own records is worth having even if
      // the vehicle isn't in our curated model list at all. Failure here
      // is silent and non-blocking: the vehicle lookup already succeeded,
      // this is a bonus, and "no MOT history yet" (a bike under 3 years
      // old) is a completely normal, expected outcome, not an error.
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
        // Make matched but the specific model isn't in our curated list -
        // rather than making the user retype what was just found, drop
        // straight into the custom-entry fields pre-filled with the real
        // returned data. They can still switch back to a dropdown pick
        // themselves if they'd rather.
        setModel(OTHER);
        setCustomModel(String(data.model ?? ''));
        if (data.engineCapacityCc) setCustomEngineCC(String(data.engineCapacityCc));
        parts.push(`Matched the make (${matchedBrand}). "${data.model}" isn't in our model list, so it's been filled in below as a custom entry - check it over, or pick a listed model instead if you'd rather.`);
      } else {
        setMake(OTHER);
        setCustomMake(String(data.make ?? ''));
        setModel(OTHER);
        setCustomModel(String(data.model ?? ''));
        if (data.engineCapacityCc) setCustomEngineCC(String(data.engineCapacityCc));
        parts.push(`Found "${data.make} ${data.model}" - not in our make list at all, so both have been filled in below as a custom entry. Check the details before submitting.`);
      }
      if (data.plateInRetention) {
        parts.push('Note: this plate is currently in retention (not on any vehicle right now) - the details shown are from the last vehicle it was recorded against, so double-check they\'re actually right for this bike.');
      }
      setLookupMessage({ text: parts.join(' '), tone: matchedBrand && matchedModelName ? 'ok' : 'warn' });
    } catch {
      setLookupMessage({ text: "Couldn't reach the lookup service - enter details manually below.", tone: 'error' });
    } finally {
      setLookingUp(false);
    }
  }

  const selectedModelData = MOTORCYCLE_MODELS.find((m) => m.make === make && m.model === model);
  const isCustomMake = make === OTHER;
  const isCustomModel = model === OTHER;
  const effectiveMake = isCustomMake ? customMake.trim() : make;
  const effectiveModel = isCustomModel ? customModel.trim() : model;
  const effectiveEngineCC = isCustomModel ? Number(customEngineCC) : selectedModelData?.engineCC;

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
    if (isCustomModel && (!customEngineCC || !(Number(customEngineCC) > 0))) {
      setFormError('Enter a valid engine size in cc.');
      return;
    }
    if (minMileage !== null) {
      if (!(Number(mileage) >= minMileage)) {
        setFormError(`Current mileage has to be at least ${minMileage.toLocaleString()} miles - that's what your last MOT recorded.`);
        return;
      }
      if (!mileageConfirmed) {
        setFormError('Please confirm the current mileage figure before adding the bike.');
        return;
      }
    }
    if (!isCustomModel && !selectedModelData) return;
    const ok = await submit({
      make: effectiveMake,
      model: effectiveModel,
      engineCC: effectiveEngineCC as number,
      year: isCustomBuild ? undefined : Number(year),
      isCustomBuild,
      registration,
      currentMileage: Number(mileage),
      nickname,
      region,
    });
    // Best-effort, non-blocking - the bike itself is already saved
    // successfully regardless of what happens here. If this fails
    // silently (no MOT history for this plate, service hiccup, etc.),
    // the bike still exists and MOT import can always be run again
    // later - the endpoint safely skips anything already logged.
    if (ok) {
      const newBikeId = (lastResponse.current as { bike?: { id?: string } } | null)?.bike?.id;
      if (newBikeId) {
        try {
          await fetch('/api/tracker/mot-history', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bikeId: newBikeId }),
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
        <span className="ticket__label">Add your bike</span>
        <div className="field">
          <label htmlFor="bike-make">Make</label>
          <select id="bike-make" value={make} onChange={(e) => handleMakeChange(e.target.value)}>
            {ALL_BRANDS.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
            <option value={OTHER}>Other / not in this list</option>
          </select>
        </div>
        {isCustomMake ? (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bike-custom-make">Make (enter manually)</label>
            <input id="bike-custom-make" type="text" value={customMake} onChange={(e) => setCustomMake(e.target.value)} placeholder="e.g. Zontes" />
          </div>
        ) : (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bike-model">Model</label>
            <select id="bike-model" value={model} onChange={(e) => setModel(e.target.value)}>
              {modelsForBrand.map((m) => (
                <option key={m.model} value={m.model}>{m.model} ({m.engineCC}cc)</option>
              ))}
              <option value={OTHER}>Other / not in this list</option>
            </select>
          </div>
        )}
        {isCustomModel && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bike-custom-model">Model (enter manually)</label>
            <input id="bike-custom-model" type="text" value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="e.g. K 1200 GT" />
          </div>
        )}
        {isCustomModel ? (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bike-custom-cc">Engine size (cc)</label>
            <input id="bike-custom-cc" type="number" min="1" value={customEngineCC} onChange={(e) => setCustomEngineCC(e.target.value)} placeholder="e.g. 1200" />
            <p className="field-note" style={{ marginTop: '0.4rem' }}>
              Not in our curated list, so this one needs the engine size entered directly rather than looked up - it drives cost benchmarking and reminder defaults elsewhere in the app.
            </p>
          </div>
        ) : (
          selectedModelData && (
            <div className="field-note" style={{ marginTop: '0.9rem' }}>
              Engine size: {selectedModelData.engineCC}cc ({getBikeClassForCC(selectedModelData.engineCC)})
            </div>
          )
        )}
        <div className="field-checkbox" style={{ marginTop: '0.9rem' }}>
          <label>
            <input type="checkbox" checked={isCustomBuild} onChange={(e) => setIsCustomBuild(e.target.checked)} />
            This is a custom build (no single production year applies)
          </label>
        </div>
        {!isCustomBuild && (
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor="bike-year">Year</label>
            <input id="bike-year" type="number" min="1990" max="2026" value={year} onChange={(e) => setYear(e.target.value)} required />
          </div>
        )}
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bike-registration">Registration number</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <input
              id="bike-registration"
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
          <p className="field-note" style={{ marginTop: '0.4rem' }}>
            This is recorded permanently as this bike&apos;s original registration and can&apos;t be removed later - only
            added to, if the plate genuinely changes (e.g. a private plate). It&apos;s what lets a future buyer trust that
            a report&apos;s history really belongs to the bike in front of them, so please enter the real one rather than
            a placeholder.
          </p>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bike-mileage">Current mileage</label>
          <input
            id="bike-mileage"
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
                  I confirm this mileage is correct, or I&apos;ve updated it to the bike&apos;s real current reading
                </label>
              </div>
            </>
          )}
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bike-region">Where you keep and run it</label>
          <select id="bike-region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{REGION_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bike-nickname">Nickname (optional)</label>
          <input id="bike-nickname" type="text" placeholder="e.g. The Tiger" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting}>
          {submitting ? 'Adding…' : 'Add bike'}
        </button>
        {formError && <p className="error-text" role="alert">{formError}</p>}
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
