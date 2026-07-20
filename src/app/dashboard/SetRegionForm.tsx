// Place at: src/app/dashboard/SetRegionForm.tsx
'use client';

import { useState } from 'react';
import { REGION_LABELS, type Region } from '@/lib/priceData';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';

const REGIONS = Object.keys(REGION_LABELS) as Region[];

export function SetRegionForm() {
  const [region, setRegion] = useState<Region>('rest-england-wales');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit({ region }, 'PATCH');
  }

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">One quick thing</span>
        <p style={{ marginTop: 0 }}>
          We added regional pricing since you added your bike - where do you keep and run it?
          This is used to compare what you pay against typical prices for your area.
        </p>
        <div className="field">
          <label htmlFor="region-select">Where you keep and run it</label>
          <select id="region-select" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{REGION_LABELS[r]}</option>
            ))}
          </select>
        </div>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save and continue'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
