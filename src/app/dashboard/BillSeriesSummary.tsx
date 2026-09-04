// Place at: src/app/dashboard/BillSeriesSummary.tsx
'use client';

import type { BillSeriesDoc } from '@/lib/tracker/billSeries';
import { seriesTotalCost, seriesEndDate } from '@/lib/tracker/billSeriesSchedule';
import { BILL_LABELS, BILL_SERIES_FREQUENCY_LABELS } from '@/lib/tracker/billTypes';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useTrackerFormSubmit } from './useTrackerFormSubmit';
import styles from './dashboard.module.css';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function SeriesRow({ series, currency, rates }: { series: BillSeriesDoc; currency: Currency; rates: ExchangeRates | null }) {
  const { submit, submitting, error } = useTrackerFormSubmit(`/api/tracker/bill-series/${encodeURIComponent(series.id)}`);

  async function handleEnd() {
    if (!confirm("End this plan? RoadVerdict will stop logging future payments for it automatically - anything already logged stays untouched.")) return;
    await submit({ action: 'end' }, 'PATCH');
  }

  const total = seriesTotalCost(series);
  const loggedCount = series.lastMaterializedIndex + 1;
  const statusNote =
    series.status === 'active'
      ? `runs until ${fmtDate(seriesEndDate(series))}`
      : series.status === 'completed'
        ? 'plan completed'
        : 'ended early';

  return (
    <div className={styles.card} style={{ marginBottom: '0.6rem' }}>
      <div className={styles.jobCardTop}>
        <span className={styles.jobCardJob}>
          {BILL_LABELS[series.billType] ?? series.billType} plan · {BILL_SERIES_FREQUENCY_LABELS[series.frequency]}
        </span>
        <span className={styles.jobCardCost}>{formatCurrency(total, currency, rates)} total</span>
      </div>
      <div className={styles.jobCardMeta}>
        {loggedCount} of {series.instalmentCount} payments logged so far · {statusNote}
      </div>
      {series.notes && <div className={styles.jobCardNotes}>{series.notes}</div>}
      {series.status === 'active' && (
        <div className={styles.cardActions}>
          <button type="button" className={styles.iconBtn} onClick={handleEnd} disabled={submitting}>
            {submitting ? 'Ending…' : 'End this plan'}
          </button>
        </div>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}

export function BillSeriesSummary({
  series,
  currency,
  rates,
}: {
  series: BillSeriesDoc[];
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <h2 className={styles.sectionHeading}>Instalment plans</h2>
      {series.map((s) => (
        <SeriesRow key={s.id} series={s} currency={currency} rates={rates} />
      ))}
    </div>
  );
}
