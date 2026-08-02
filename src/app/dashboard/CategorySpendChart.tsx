// Place at: src/app/dashboard/CategorySpendChart.tsx
'use client';

import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip } from 'chart.js';
import type { MonthlyTotal } from '@/lib/tracker/summary';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip);

export function CategorySpendChart({
  chartId,
  title,
  data,
  color,
  currency,
  rates,
  initialChartType,
}: {
  chartId: string;
  title: string;
  data: MonthlyTotal[];
  color: string;
  currency: Currency;
  rates: ExchangeRates | null;
  initialChartType?: 'bar' | 'line';
}) {
  const { kind, changeKind } = useChartTypePreference(chartId, initialChartType ?? 'bar');
  const symbol = CURRENCY_SYMBOLS[currency];
  const labels = data.map((d) => d.month);
  const dataValues = data.map((d) => convertGbpToDisplay(d.total, currency, rates));

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['bar', 'line']} />
      </div>
      {kind === 'line' ? (
        <Line
          data={{
            labels,
            datasets: [
              {
                data: dataValues,
                borderColor: color,
                backgroundColor: 'transparent',
                borderWidth: 1.25,
                tension: 0.25,
                fill: false,
                pointRadius: 2,
                pointBackgroundColor: color,
              },
            ],
          }}
          options={{
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              y: { grid: { color: '#00000012' }, ticks: { font: { size: 10 }, callback: (value) => `${symbol}${value}` } },
            },
          }}
        />
      ) : (
        <Bar
          data={{
            labels,
            datasets: [{ data: dataValues, backgroundColor: color }],
          }}
          options={{
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } },
            },
            scales: {
              x: { grid: { display: false }, ticks: { font: { size: 10 } } },
              y: { grid: { color: '#00000012' }, ticks: { font: { size: 10 }, callback: (value) => `${symbol}${value}` } },
            },
          }}
        />
      )}
    </div>
  );
}
