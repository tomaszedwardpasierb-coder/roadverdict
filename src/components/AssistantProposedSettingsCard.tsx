// Place at: src/components/AssistantProposedSettingsCard.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { REGION_LABELS, type Region } from '@/lib/priceData';
import { ALL_CURRENCIES, CURRENCY_LABELS, type Currency } from '@/lib/tracker/currency';
import type { DistanceUnit, FuelEconomyUnit } from '@/lib/tracker/unitFormat';
import { VehicleSpinner } from './VehicleSpinner';
import styles from './AssistantProposedEntryCard.module.css';

export interface ProposedSettingsChange {
  category: 'settings';
  vehicleKind: 'bike' | 'car';
  currentMileage?: number;
  region?: Region;
  annualBudget?: number;
  currency?: Currency;
  distanceUnit?: DistanceUnit;
  fuelEconomyUnit?: FuelEconomyUnit;
  includeInsuranceInReport?: boolean;
  includeFinanceInReport?: boolean;
  includeFinesInReport?: boolean;
  includeTollsInReport?: boolean;
  includeCleaningInReport?: boolean;
}

const REGIONS: Region[] = ['london-se', 'rest-england-wales', 'scotland-ni'];
const DISTANCE_UNITS: { value: DistanceUnit; label: string }[] = [
  { value: 'mi', label: 'Miles' },
  { value: 'km', label: 'Kilometres' },
];
const FUEL_ECONOMY_UNITS: { value: FuelEconomyUnit; label: string }[] = [
  { value: 'mpg', label: 'MPG' },
  { value: 'l100km', label: 'L/100km' },
];
const REPORT_TOGGLES: { key: keyof ProposedSettingsChange; label: string }[] = [
  { key: 'includeInsuranceInReport', label: 'Show insurance history in buyer report' },
  { key: 'includeFinanceInReport', label: 'Show finance history in buyer report' },
  { key: 'includeFinesInReport', label: 'Show fines in buyer report' },
  { key: 'includeTollsInReport', label: 'Show tolls in buyer report' },
  { key: 'includeCleaningInReport', label: 'Show valeting/washing costs in buyer report' },
];

// Renders the AI assistant's draft for a settings change - only the
// fields the model actually proposed changing are shown, each still
// fully editable before confirming. "Save changes" PATCHes the exact
// same /api/tracker/bike or /api/cars/car endpoint the manual dashboard
// settings use, so every existing server-side validation still applies.
// This never writes anything on its own; only the person's own click does.
export function AssistantProposedSettingsCard({ change }: { change: ProposedSettingsChange }) {
  const router = useRouter();
  const isCar = change.vehicleKind === 'car';
  const [currentMileage, setCurrentMileage] = useState(change.currentMileage != null ? String(change.currentMileage) : '');
  const [region, setRegion] = useState<Region | ''>(change.region ?? '');
  const [annualBudget, setAnnualBudget] = useState(change.annualBudget != null ? String(change.annualBudget) : '');
  const [currency, setCurrency] = useState<Currency | ''>(change.currency ?? '');
  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit | ''>(change.distanceUnit ?? '');
  const [fuelEconomyUnit, setFuelEconomyUnit] = useState<FuelEconomyUnit | ''>(change.fuelEconomyUnit ?? '');
  const [toggles, setToggles] = useState<Partial<Record<string, boolean>>>({
    includeInsuranceInReport: change.includeInsuranceInReport,
    includeFinanceInReport: change.includeFinanceInReport,
    includeFinesInReport: change.includeFinesInReport,
    includeTollsInReport: change.includeTollsInReport,
    includeCleaningInReport: change.includeCleaningInReport,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleConfirm() {
    setSubmitting(true);
    setError(null);

    if (change.currentMileage != null) {
      const n = Number(currentMileage);
      if (!Number.isFinite(n) || n < 0) {
        setError('Enter a valid mileage.');
        setSubmitting(false);
        return;
      }
    }
    if (change.annualBudget != null) {
      const n = Number(annualBudget);
      if (!Number.isFinite(n) || n <= 0) {
        setError('Enter a valid annual budget.');
        setSubmitting(false);
        return;
      }
    }

    const body: Record<string, unknown> = {};
    if (change.currentMileage != null) body.currentMileage = Number(currentMileage);
    if (change.region != null) body.region = region;
    if (change.annualBudget != null) body.annualBudget = Number(annualBudget);
    if (change.currency != null) body.currency = currency;
    if (change.distanceUnit != null) body.distanceUnit = distanceUnit;
    if (change.fuelEconomyUnit != null) body.fuelEconomyUnit = fuelEconomyUnit;
    for (const { key } of REPORT_TOGGLES) {
      if (toggles[key] !== undefined) body[key] = toggles[key];
    }

    try {
      const res = await fetch(isCar ? '/api/cars/car' : '/api/tracker/bike', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }
      setSaved(true);
      setSubmitting(false);
      router.refresh();
    } catch {
      setError('Could not reach RoadVerdict. Check your connection and try again.');
      setSubmitting(false);
    }
  }

  if (saved) {
    return (
      <div className={styles.card}>
        <p className={styles.loggedNote}>✓ Settings updated</p>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>Update settings</span>

      {change.currentMileage != null && (
        <div className={styles.field}>
          <label htmlFor="ai-settings-mileage">Current mileage</label>
          <input id="ai-settings-mileage" type="number" min="0" value={currentMileage} onChange={(e) => setCurrentMileage(e.target.value)} disabled={submitting} />
        </div>
      )}

      {change.region != null && (
        <div className={styles.field}>
          <label htmlFor="ai-settings-region">Region</label>
          <select id="ai-settings-region" value={region} onChange={(e) => setRegion(e.target.value as Region)} disabled={submitting}>
            {REGIONS.map((r) => (
              <option key={r} value={r}>{REGION_LABELS[r]}</option>
            ))}
          </select>
        </div>
      )}

      {change.annualBudget != null && (
        <div className={styles.field}>
          <label htmlFor="ai-settings-budget">Annual budget (£)</label>
          <input id="ai-settings-budget" type="number" min="0" step="0.01" value={annualBudget} onChange={(e) => setAnnualBudget(e.target.value)} disabled={submitting} />
        </div>
      )}

      {change.currency != null && (
        <div className={styles.field}>
          <label htmlFor="ai-settings-currency">Currency</label>
          <select id="ai-settings-currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} disabled={submitting}>
            {ALL_CURRENCIES.map((c) => (
              <option key={c} value={c}>{CURRENCY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      )}

      {change.distanceUnit != null && (
        <div className={styles.field}>
          <label htmlFor="ai-settings-distance-unit">Distance unit</label>
          <select id="ai-settings-distance-unit" value={distanceUnit} onChange={(e) => setDistanceUnit(e.target.value as DistanceUnit)} disabled={submitting}>
            {DISTANCE_UNITS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {change.fuelEconomyUnit != null && (
        <div className={styles.field}>
          <label htmlFor="ai-settings-fuel-unit">Fuel economy unit</label>
          <select id="ai-settings-fuel-unit" value={fuelEconomyUnit} onChange={(e) => setFuelEconomyUnit(e.target.value as FuelEconomyUnit)} disabled={submitting}>
            {FUEL_ECONOMY_UNITS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {REPORT_TOGGLES.filter((t) => toggles[t.key] !== undefined).map((t) => (
        <label key={t.key} className={styles.checkboxField}>
          <input
            type="checkbox"
            checked={Boolean(toggles[t.key])}
            onChange={(e) => setToggles((prev) => ({ ...prev, [t.key]: e.target.checked }))}
            disabled={submitting}
          />
          {t.label}
        </label>
      ))}

      {error && <p className={styles.errorNote} role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.confirmBtn} onClick={handleConfirm} disabled={submitting}>
          {submitting && <VehicleSpinner kind={change.vehicleKind} size={20} />}
          {submitting ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
