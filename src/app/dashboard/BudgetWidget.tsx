// Place at: src/app/dashboard/BudgetWidget.tsx
'use client';

import { useState } from 'react';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

function fmtMoney(n: number): string {
  return `£${n.toFixed(0)}`;
}

interface Props {
  yearSpend: number;
  currentYear: number;
  initialBudget?: number;
}

export function BudgetWidget({ yearSpend, currentYear, initialBudget }: Props) {
  const [editing, setEditing] = useState(!initialBudget);
  const [amount, setAmount] = useState(initialBudget ? String(initialBudget) : '');
  const { submit, submitting, error } = useTrackerFormSubmit('/api/tracker/bike');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await submit({ annualBudget: Number(amount) }, 'PATCH');
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
            <label htmlFor="budget-amount">Annual budget (£)</label>
            <input
              id="budget-amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
      ? `⚠️ Over budget by ${fmtMoney(yearSpend - budget)}`
      : status === 'warning'
      ? `Approaching your budget for ${currentYear}`
      : `On track for ${currentYear}`;

  return (
    <div className={`${styles.budgetCard} ${statusClass}`}>
      <div className={styles.budgetCardTitle}>Annual budget ({currentYear})</div>
      <div className={styles.budgetCardAmounts}>
        {fmtMoney(yearSpend)} of {fmtMoney(budget)}
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
