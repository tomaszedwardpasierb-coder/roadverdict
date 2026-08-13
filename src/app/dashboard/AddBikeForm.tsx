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
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<{ text: string; tone: 'ok' | 'warn' | 'error' } | null>(null);

  function handleMakeChange(newMake: string) {
    setMake(newMake);
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

      const parts: string[] = [];
      if (matchedBrand && matchedModelName) {
        parts.push(`Matched to ${matchedBrand} ${matchedModelName} in our list.`);
      } else if (matchedBrand) {
        parts.push(`Matched the make (${matchedBrand}), but "${data.model}" isn't an exact match in our model list - please pick the closest one below.`);
      } else {
        parts.push(`Found "${data.make} ${data.model}", but that make isn't in our list yet - please select manually below.`);
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModelData) return;
    await submit({
      make,
      model,
      engineCC: selectedModelData.engineCC,
      year: isCustomBuild ? undefined : Number(year),
      isCustomBuild,
      registration,
      currentMileage: Number(mileage),
      nickname,
      region,
    });
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
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bike-model">Model</label>
          <select id="bike-model" value={model} onChange={(e) => setModel(e.target.value)}>
            {modelsForBrand.map((m) => (
              <option key={m.model} value={m.model}>{m.model} ({m.engineCC}cc)</option>
            ))}
          </select>
        </div>
        {selectedModelData && (
          <div className="field-note" style={{ marginTop: '0.9rem' }}>
            Engine size: {selectedModelData.engineCC}cc ({getBikeClassForCC(selectedModelData.engineCC)})
          </div>
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
              placeholder="e.g. AB12 CDE"
              value={registration}
              onChange={(e) => setRegistration(e.target.value)}
              required
              style={{ textTransform: 'uppercase', flex: 1 }}
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
          <input id="bike-mileage" type="number" min="0" value={mileage} onChange={(e) => setMileage(e.target.value)} required />
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
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
