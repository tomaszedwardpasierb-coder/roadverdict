// Place at: src/app/dashboard/BudgetWidget.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import styles from './dashboard.module.css';

interface Props {
  yearSpend: number;
  currentYear: number;
  initialBudget?: number;
  currency: Currency;
  rates: ExchangeRates | null;
}

export function BudgetWidget({ yearSpend, currentYear, initialBudget, currency, rates }: Props) {
  const [editing, setEditing] = useState(!initialBudget);
  const [amountDisplay, setAmountDisplay] = useState(
    initialBudget ? convertGbpToDisplay(initialBudget, currency, rates).toFixed(2) : ''
  );
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

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
          <button className="submit-button" type="submit" disabled={submitting}>
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
      <button type="button" className={styles.iconBtn} style={{ marginTop: '0.6rem' }} onClick={() => setEditing(true)}>
        Change budget
      </button>
    </div>
  );
}
