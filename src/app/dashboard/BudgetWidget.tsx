// Place at: src/app/dashboard/BudgetWidget.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import type { YearEndProjection } from '@/lib/tracker/summary';
import { VehicleSpinner } from '@/components/VehicleSpinner';
import styles from './dashboard.module.css';

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
  // projection (see summary.ts's projectYearEndSpend) - shown regardless
  // of whether the reactive over/under-so-far status below is already
  // "over", since the whole point is catching it BEFORE that happens.
  yearEndProjection?: YearEndProjection | null;
}

export function BudgetWidget({ yearSpend, currentYear, initialBudget, currency, rates, vehicleKind = 'bike', yearEndProjection }: Props) {
  const [editing, setEditing] = useState(!initialBudget);
  const [amountDisplay, setAmountDisplay] = useState(
    initialBudget ? convertGbpToDisplay(initialBudget, currency, rates).toFixed(2) : ''
  );
  const { submit, submitting, error } = useTrackerFormSubmit(vehicleKind === 'car' ? '/api/cars/car' : '/api/tracker/bike');

  const symbol = CURRENCY_SYMBOLS[currency];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const budgetInGbp = convertDisplayToGbp(Number(amountDisplay), currency, rates);
    const ok = await submit({ annualBudget: budgetInGbp }, 'PATCH');
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <form className={styles.budgetCard} onSubmit={handleSubmit}>
        <div className={styles.budgetCardTitle}>Annual budget</div>
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
  const pct = Math.min(100, (yearSpend / budget) * 100);
  const status = yearSpend >= budget ? 'over' : yearSpend >= budget * 0.8 ? 'warning' : 'ok';
  const statusClass = status === 'over' ? styles.budgetCardOver : status === 'warning' ? styles.budgetCardWarning : '';
  const fillClass =
    status === 'over' ? styles.budgetBarFillOver : status === 'warning' ? styles.budgetBarFillWarning : styles.budgetBarFillOk;
  const statusText =
    status === 'over'
      ? `⚠️ Over budget by ${formatCurrency(yearSpend - budget, currency, rates)}`
      : status === 'warning'
      ? `Approaching your budget for ${currentYear}`
      : `On track for ${currentYear}`;

  // Forward-looking, unlike statusText above (which only ever reports
  // what's already happened) - this is the whole reason it's a separate
  // line rather than folded into statusText: it can say something useful
  // even while status is still "ok", which is exactly when catching a
  // coming overspend is actually still useful.
  const projectionText = (() => {
    if (!yearEndProjection) return null;
    const diff = budget - yearEndProjection.projected;
    return diff >= 0
      ? `At this rate, you'll finish ${currentYear} about ${formatCurrency(diff, currency, rates)} under budget.`
      : `At this rate, you'll go about ${formatCurrency(Math.abs(diff), currency, rates)} over budget by the end of ${currentYear}.`;
  })();

  return (
    <div className={`${styles.budgetCard} ${statusClass}`}>
      <div className={styles.budgetCardTitle}>Annual budget ({currentYear})</div>
      <div className={styles.budgetCardAmounts}>
        {formatCurrency(yearSpend, currency, rates)} of {formatCurrency(budget, currency, rates)}
      </div>
      <div className={styles.budgetBar}>
        <div className={`${styles.budgetBarFill} ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
      <div className={styles.budgetCardStatus}>{statusText}</div>
      {projectionText && <div className={styles.budgetProjection}>{projectionText}</div>}
      <button type="button" className={styles.iconBtn} style={{ marginTop: '0.6rem' }} onClick={() => setEditing(true)}>
        Change budget
      </button>
    </div>
  );
}
