// Place at: src/app/dashboard/BudgetWidget.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import type { YearEndProjection } from '@/lib/tracker/summary';
import { useChartFilter } from './ChartFilterContext';
import { FORECAST_WINDOW_LABELS, FORECAST_WINDOW_DAYS, type ForecastWindow } from '@/lib/tracker/costForecast';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';
import ownStyles from './BudgetWidget.module.css';

interface Props {
  yearSpend: number;
  currentYear: number;
  initialBudget?: number;
  currency: Currency;
  rates: ExchangeRates | null;
  // Defaults to 'bike' so every existing call site keeps working
  // unchanged - same minimal-generalization pattern UpdateMileageButton
  // already uses, rather than a duplicate car-only component for what's
  // otherwise identical UI.
  vehicleKind?: 'bike' | 'car';
  // null whenever there isn't enough of the year elapsed yet to trust a
  // projection (see summary.ts's projectYearEndSpend) - only used in the
  // real (non-Forecast) view below; Forecast mode has its own, genuinely
  // forward-looking comparison instead (see spendForecastByWindow).
  yearEndProjection?: YearEndProjection | null;
  // Same precomputed-per-window bundle DashboardStatCards' own
  // "Projected spend" card uses (see costForecast.ts's
  // totalForecastSpend) - what "Future budget" compares the prorated
  // target against.
  spendForecastByWindow?: Record<ForecastWindow, number>;
}

export function BudgetWidget({ yearSpend, currentYear, initialBudget, currency, rates, vehicleKind = 'bike', yearEndProjection, spendForecastByWindow }: Props) {
  const [editing, setEditing] = useState(!initialBudget);
  const [amountDisplay, setAmountDisplay] = useState(
    initialBudget ? convertGbpToDisplay(initialBudget, currency, rates).toFixed(2) : ''
  );
  const { submit, submitting, error } = useTrackerFormSubmit(vehicleKind === 'car' ? '/api/cars/car' : '/api/tracker/bike');
  const { forecastMode, forecastWindow } = useChartFilter();

  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const budgetInGbp = convertDisplayToGbp(Number(amountDisplay), currency, rates);
    const ok = await submit({ annualBudget: budgetInGbp }, 'PATCH');
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <form className={`${ownStyles.budgetCard} ${styles.budgetCard}`} onSubmit={handleSubmit}>
        <div className={ownStyles.budgetCardTitle}>Annual budget</div>
        <p className={styles.emptyNote}>
          No budget set for {currentYear} yet - optional, purely for your own tracking.
        </p>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap', marginTop: '0.6rem' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="budget-amount">Annual budget ({symbol})</label>
            <input
              id="budget-amount"
              type="number"
              min="1"
              value={amountDisplay}
              onChange={(e) => setAmountDisplay(e.target.value)}
              required
            />
          </div>
          <button className={styles.scanReceiptBtn} type="submit" disabled={submitting}>
            {submitting && <VehicleSpinner kind={vehicleKind} size={20} />}
            {submitting ? 'Saving…' : 'Set budget'}
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </form>
    );
  }

  const budget = initialBudget ?? 0;

  // "Future budget" - the same annual figure, prorated down to however
  // much of it is "allowed" for the selected window, so the number means
  // something at a glance regardless of which window is picked ("am I on
  // pace") rather than always showing the full annual figure next to a
  // much smaller window total. "1y" is the literal full annual amount,
  // not (budget/365)*365 - stated separately so it's never off by a
  // rounding cent from the real figure the person actually typed in.
  const windowLabel = FORECAST_WINDOW_LABELS[forecastWindow];
  const proratedBudget = forecastWindow === '1y' ? budget : Math.round((budget / 365) * FORECAST_WINDOW_DAYS[forecastWindow]);
  const projectedSpendForWindow = spendForecastByWindow?.[forecastWindow] ?? 0;

  const displayBudget = forecastMode ? proratedBudget : budget;
  const displaySpend = forecastMode ? projectedSpendForWindow : yearSpend;
  const pct = displayBudget > 0 ? Math.min(100, (displaySpend / displayBudget) * 100) : 0;
  const status = displaySpend >= displayBudget ? 'over' : displaySpend >= displayBudget * 0.8 ? 'warning' : 'ok';
  const statusClass = status === 'over' ? ownStyles.budgetCardOver : status === 'warning' ? ownStyles.budgetCardWarning : '';
  const fillClass =
    status === 'over' ? ownStyles.budgetBarFillOver : status === 'warning' ? ownStyles.budgetBarFillWarning : ownStyles.budgetBarFillOk;
  const statusText = forecastMode
    ? status === 'over'
      ? `⚠️ Projected to go ${formatCurrency(displaySpend - displayBudget, currency, rates)} over your budget for the ${windowLabel.toLowerCase()}`
      : status === 'warning'
      ? `Approaching your budget for the ${windowLabel.toLowerCase()}`
      : `On track for the ${windowLabel.toLowerCase()}`
    : status === 'over'
    ? `⚠️ Over budget by ${formatCurrency(displaySpend - displayBudget, currency, rates)}`
    : status === 'warning'
    ? `Approaching your budget for ${currentYear}`
    : `On track for ${currentYear}`;

  // Forward-looking, unlike statusText above (which only ever reports
  // what's already happened) - this is the whole reason it's a separate
  // line rather than folded into statusText: it can say something useful
  // even while status is still "ok", which is exactly when catching a
  // coming overspend is actually still useful. Only shown in the real
  // (non-Forecast) view - Future budget above is already the forward-
  // looking figure, so this sentence would be redundant (or worse,
  // conflicting - it's a full-year projection, not scoped to whichever
  // window is currently selected) once Forecast mode is on.
  const projectionText = forecastMode
    ? null
    : (() => {
        if (!yearEndProjection) return null;
        const diff = budget - yearEndProjection.projected;
        return diff >= 0
          ? `At this rate, you'll finish ${currentYear} about ${formatCurrency(diff, currency, rates)} under budget.`
          : `At this rate, you'll go about ${formatCurrency(Math.abs(diff), currency, rates)} over budget by the end of ${currentYear}.`;
      })();

  return (
    <div className={`${ownStyles.budgetCard} ${styles.budgetCard} ${statusClass}`}>
      <div className={ownStyles.budgetCardTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {forecastMode ? `Future budget (${windowLabel})` : `Annual budget (${currentYear})`}
        {forecastMode && <span className={styles.forecastBadge}>Estimate</span>}
      </div>
      <div className={ownStyles.budgetCardAmounts}>
        {formatCurrency(displaySpend, currency, rates)} of {formatCurrency(displayBudget, currency, rates)}
      </div>
      <div className={ownStyles.budgetBar}>
        <div className={`${ownStyles.budgetBarFill} ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={ownStyles.budgetCardStatus}>{statusText}</div>
      {projectionText && <div className={ownStyles.budgetProjection}>{projectionText}</div>}
      <button type="button" className={styles.iconBtn} style={{ marginTop: '0.6rem' }} onClick={() => setEditing(true)}>
        Change budget
      </button>
    </div>
  );
}
