// Place at: src/app/dashboard/ModCard.tsx
'use client';

import { useState } from 'react';
import { MOD_GROUPS, MOD_LABELS, MOD_LABEL_TO_KEY, findGroupForCategory } from '@/lib/tracker/modTypes';
import type { ModDoc } from '@/lib/tracker/mod';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { formatDistance, convertMilesToDisplay, convertDisplayToMiles, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ModCard({
  mod,
  distanceUnit,
  currency,
  rates,
}: {
  mod: ModDoc;
  distanceUnit: DistanceUnit;
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [group, setGroup] = useState(() => findGroupForCategory(mod.category));
  const [category, setCategory] = useState(mod.category);
  const [categorySearch, setCategorySearch] = useState('');
  const [name, setName] = useState(mod.name);
  const [costDisplay, setCostDisplay] = useState(
    convertGbpToDisplay(mod.cost, currency, rates).toFixed(2)
  );
  const [mileageDisplay, setMileageDisplay] = useState(
    String(Math.round(convertMilesToDisplay(mod.mileage, distanceUnit)))
  );
  const [date, setDate] = useState(mod.date);
  const [notes, setNotes] = useState(mod.notes);
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/mods/${encodeURIComponent(mod.id)}`);

  function handleGroupChange(newGroup: string) {
    setGroup(newGroup);
    const groupData = MOD_GROUPS.find((g) => g.group === newGroup);
    setCategory(groupData?.subgroups[0]?.mods[0] ?? '');
  }

  function handleCategorySearch(value: string) {
    setCategorySearch(value);
    const matchedKey = MOD_LABEL_TO_KEY[value];
    if (matchedKey) {
      setCategory(matchedKey);
      setGroup(findGroupForCategory(matchedKey));
    }
  }

  const selectedGroupData = MOD_GROUPS.find((g) => g.group === group);

  const unitLabel = distanceUnitLabel(distanceUnit);
  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const mileageInMiles = Math.round(convertDisplayToMiles(Number(mileageDisplay), distanceUnit));
    const costInGbp = convertDisplayToGbp(Number(costDisplay), currency, rates);
    const ok = await submit({ category, name, cost: costInGbp, mileage: mileageInMiles, date, notes }, 'PATCH');
    if (ok) setIsEditing(false);
  }

  async function handleDelete() {
    if (!confirm("Delete this modification? This can't be undone.")) return;
    await submit(undefined, 'DELETE');
  }

  if (isEditing) {
    return (
      <form className="ticket" onSubmit={handleSave} style={{ marginBottom: '0.7rem' }}>
        <div className="ticket__section">
          <div className="field">
            <label htmlFor={`edit-mod-date-${mod.id}`}>Date</label>
            <input id={`edit-mod-date-${mod.id}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-search-${mod.id}`}>Search for an item</label>
            <input
              id={`edit-mod-search-${mod.id}`}
              type="text"
              list={`edit-mod-catalog-datalist-${mod.id}`}
              value={categorySearch}
              onChange={(e) => handleCategorySearch(e.target.value)}
              placeholder="e.g. chain guide, tank bag, disc lock..."
            />
            <datalist id={`edit-mod-catalog-datalist-${mod.id}`}>
              {Object.keys(MOD_LABEL_TO_KEY).map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-group-${mod.id}`}>Group</label>
            <select id={`edit-mod-group-${mod.id}`} value={group} onChange={(e) => handleGroupChange(e.target.value)}>
              {MOD_GROUPS.map((g) => (
                <option key={g.group} value={g.group}>{g.group}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-category-${mod.id}`}>Category</label>
            <select id={`edit-mod-category-${mod.id}`} value={category} onChange={(e) => setCategory(e.target.value)}>
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
            <label htmlFor={`edit-mod-name-${mod.id}`}>What is it?</label>
            <input id={`edit-mod-name-${mod.id}`} type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-cost-${mod.id}`}>Cost ({symbol})</label>
            <input id={`edit-mod-cost-${mod.id}`} type="number" min="0" step="0.01" value={costDisplay} onChange={(e) => setCostDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-mileage-${mod.id}`}>Mileage ({unitLabel})</label>
            <input id={`edit-mod-mileage-${mod.id}`} type="number" min="0" value={mileageDisplay} onChange={(e) => setMileageDisplay(e.target.value)} required />
          </div>
          <div className="field" style={{ marginTop: '0.9rem' }}>
            <label htmlFor={`edit-mod-notes-${mod.id}`}>Notes</label>
            <textarea id={`edit-mod-notes-${mod.id}`} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <hr className="ticket__divider" />
        <div className="ticket__section" style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          <button className="submit-button" type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(false)} disabled={submitting}>
            Cancel
          </button>
          {error && <p className="error-text" role="alert">{error}</p>}
        </div>
      </form>
    );
  }

  return (
    <div className={styles.jobCard}>
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>{mod.name}</span>
        <span className={styles.jobCardCost}>{formatCurrency(mod.cost, currency, rates)}</span>
      </div>
      <div className={styles.jobCardMeta}>
        {MOD_LABELS[mod.category]} · {fmtDate(mod.date)} · {formatDistance(mod.mileage, distanceUnit)}
      </div>
      {mod.notes && <div className={styles.jobCardNotes}>{mod.notes}</div>}
      <div className={styles.cardActions}>
        <button type="button" className={styles.iconBtn} onClick={() => setIsEditing(true)}>Edit</button>
        <button type="button" className={styles.iconBtn} onClick={handleDelete} disabled={submitting}>
          {submitting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
