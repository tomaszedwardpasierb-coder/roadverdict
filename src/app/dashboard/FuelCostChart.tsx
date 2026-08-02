// Place at: src/app/dashboard/FuelCostChart.tsx
'use client';

import { useState } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js';
import { RANGE_OPTIONS, filterByDateRange, type RangeValue } from '@/lib/tracker/dateRange';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const CHART_ID = 'fuel-cost';

interface FuelPoint {
  date: string;
  cost: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FuelCostChart({
  points,
  currency,
  rates,
  initialChartType,
}: {
  points: FuelPoint[];
  currency: Currency;
  rates: ExchangeRates | null;
  initialChartType?: 'line' | 'bar';
}) {
  const [range, setRange] = useState<RangeValue>('all');
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line');
  const filtered = filterByDateRange(points, range).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
  const symbol = CURRENCY_SYMBOLS[currency];
  const labels = filtered.map((p) => fmtDate(p.date));
  const dataValues = filtered.map((p) => convertGbpToDisplay(p.cost, currency, rates));

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>Fuel cost over time</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['line', 'bar']} />
      </div>
      <div className={styles.rangeTabs}>
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            className={`${styles.rangeTab} ${range === o.value ? styles.rangeTabActive : ''}`}
            onClick={() => setRange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <p className={styles.emptyNote}>No fuel fill-ups logged in this time range.</p>
      ) : kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [{ label: `Fuel cost per fill-up (${symbol})`, data: dataValues, backgroundColor: barGradient('#3d8b6f'), borderRadius: BAR_BORDER_RADIUS }],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${(ctx.parsed.y as number).toFixed(2)}` } },
            },
            scales: {
              y: { grid: { color: '#00000012' }, ticks: { callback: (value) => `${symbol}${value}` } },
              x: { grid: { display: false } },
            },
            maintainAspectRatio: true,
          }}
        />
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              {
                label: `Fuel cost per fill-up (${symbol})`,
                data: dataValues,
                borderColor: '#3d8b6f',
                backgroundColor: 'transparent',
                borderWidth: 1.25,
                tension: 0.3,
                fill: false,
                pointRadius: 2,
                pointBackgroundColor: '#3d8b6f',
              },
            ],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${(ctx.parsed.y as number).toFixed(2)}` } },
            },
            scales: {
              y: { grid: { color: '#00000012' }, ticks: { callback: (value) => `${symbol}${value}` } },
              x: { grid: { display: false } },
            },
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
