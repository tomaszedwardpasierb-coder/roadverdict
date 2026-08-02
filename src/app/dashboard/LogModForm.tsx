// Place at: src/app/dashboard/LogModForm.tsx
'use client';

import { useState, useMemo } from 'react';
import { MOD_GROUPS, MOD_LABELS, MOD_LABEL_TO_KEY, findGroupForCategory } from '@/lib/tracker/modTypes';
import { checkMileageConsistency, type HistoryPoint } from '@/lib/tracker/mileageCheck';
import { convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertDisplayToGbp, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { MileageWarning } from './MileageWarning';

export function LogModForm({
  initialMileage,
  mileageHistory,
  distanceUnit,
  currency,
  rates,
}: {
  initialMileage: number;
  mileageHistory: HistoryPoint[];
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  const [group, setGroup] = useState(MOD_GROUPS[0].group);
  const [category, setCategory] = useState(MOD_GROUPS[0].subgroups[0].mods[0]);
  const [categorySearch, setCategorySearch] = useState('');
  const [name, setName] = useState('');
  const [costDisplay, setCostDisplay] = useState('');
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(initialMileage, distanceUnit)))
  );
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [mileageAcknowledged, setMileageAcknowledged] = useState(false);
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/mods');

  function handleGroupChange(newGroup: string) {
    setGroup(newGroup);
    const groupData = MOD_GROUPS.find((g) => g.group === newGroup);
    setCategory(groupData?.subgroups[0]?.mods[0] ?? '');
  }

  // Only acts once the typed text exactly matches a real catalog label
  // (i.e. the person picked a datalist suggestion, not just typing free
  // text) - jumps both dropdowns straight to that item.
  function handleCategorySearch(value: string) {
    setCategorySearch(value);
    const matchedKey = MOD_LABEL_TO_KEY[value];
    if (matchedKey) {
      setCategory(matchedKey);
      setGroup(findGroupForCategory(matchedKey));
    }
  }

  const selectedGroupData = MOD_GROUPS.find((g) => g.group === group);

  const mileageInMiles = convertDisplayToMiles(Number(mileageDisplay), distanceUnit);

  const mileageResult = useMemo(
    () => checkMileageConsistency(mileageInMiles, date, mileageHistory, initialMileage),
    [mileageInMiles, date, mileageHistory, initialMileage]
  );
  const isBlocked = mileageResult.status === 'blocked' || (mileageResult.status === 'warning' && !mileageAcknowledged);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBlocked) return;
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ category, name, cost: costInGbp, mileage: Math.round(mileageInMiles), date, notes });
    if (ok) {
      setName('');
      setCostDisplay('');
      setNotes('');
      setMileageAcknowledged(false);
    }
  }

  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  return (
    <form className="ticket" onSubmit={handleSubmit}>
      <div className="ticket__section">
        <span className="ticket__label">Log a modification or accessory</span>
        <div className="field">
          <label htmlFor="mod-date">Date</label>
          <input id="mod-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-category-search">Search for an item</label>
          <input
            id="mod-category-search"
            type="text"
            list="mod-catalog-datalist"
            value={categorySearch}
            onChange={(e) => handleCategorySearch(e.target.value)}
            placeholder="e.g. chain guide, tank bag, disc lock..."
          />
          <datalist id="mod-catalog-datalist">
            {Object.keys(MOD_LABEL_TO_KEY).map((label) => (
              <option key={label} value={label} />
            ))}
          </datalist>
          <div className="field-note">Not sure which group it's under? Start typing here instead.</div>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-group">Group</label>
          <select id="mod-group" value={group} onChange={(e) => handleGroupChange(e.target.value)}>
            {MOD_GROUPS.map((g) => (
              <option key={g.group} value={g.group}>{g.group}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-category">Category</label>
          <select id="mod-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {selectedGroupData?.subgroups.map((sg) => (
              <optgroup key={sg.subcategory} label={sg.subcategory}>
                {sg.mods.map((m) => (
                  <option key={m} value={m}>{MOD_LABELS[m]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-name">What is it?</label>
          <input id="mod-name" type="text" placeholder="e.g. Akrapovic slip-on can" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-cost">Cost ({symbol})</label>
          <input id="mod-cost" type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
        </div>
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-mileage">Mileage at the time ({unitLabel})</label>
          <input id="mod-mileage" type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
        </div>
        <MileageWarning result={mileageResult} distanceUnit={distanceUnit} acknowledged={mileageAcknowledged} onAcknowledgeChange={setMileageAcknowledged} />
        <div className="field" style={{ marginTop: '0.9rem' }}>
          <label htmlFor="mod-notes">Notes (optional)</label>
          <textarea id="mod-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. fitted by Bob's Motorcycles" />
        </div>
        <div className="field-note" style={{ marginTop: '0.9rem' }}>
          Worth knowing: significant modifications (exhaust, suspension, bodywork) can affect your insurance - some insurers require these to be declared. Not price-benchmarked here, since aftermarket part cost varies hugely by brand and quality.
        </div>
      </div>
      <hr className="ticket__divider" />
      <div className="ticket__section">
        <button className="submit-button" type="submit" disabled={submitting || isBlocked}>
          {submitting ? 'Logging…' : 'Log it'}
        </button>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
    </form>
  );
}
