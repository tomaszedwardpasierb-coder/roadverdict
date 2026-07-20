// Place at: src/app/dashboard/AddBikeForm.tsx
'use client';

import { useState } from 'react';
import { ALL_BRANDS, MOTORCYCLE_MODELS, getBikeClassForCC } from '@/lib/motorcycleModels';
import { REGION_LABELS, type Region } from '@/lib/priceData';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

const REGIONS = Object.keys(REGION_LABELS) as Region[];

export function AddBikeForm() {
  const [make, setMake] = useState(ALL_BRANDS[0]);
  const modelsForBrand = MOTORCYCLE_MODELS.filter((m) => m.make === make);
  const [model, setModel] = useState(modelsForBrand[0]?.model ?? '');
  const [year, setYear] = useState('2020');
  const [mileage, setMileage] = useState('12000');
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  function handleMakeChange(newMake: string) {
    setMake(newMake);
    const firstModel = MOTORCYCLE_MODELS.find((m) => m.make === newMake);
    setModel(firstModel?.model ?? '');
  }

  const selectedModelData = MOTORCYCLE_MODELS.find((m) => m.make === make && m.model === model);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedModelData) return;
    await submit({
      make,
      model,
      engineCC: selectedModelData.engineCC,
      year: Number(year),
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
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="bike-year">Year</label>
          <input id="bike-year" type="number" min="1990" max="2026" value={year} onChange={(e) => setYear(e.target.value)} required />
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
