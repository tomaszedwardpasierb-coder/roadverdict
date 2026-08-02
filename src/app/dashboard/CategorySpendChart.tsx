// Place at: src/app/dashboard/CategorySpendChart.tsx
'use client';

import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip } from 'chart.js';
import { bucketByMonth } from '@/lib/tracker/summary';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip);

interface CostItem {
  date: string;
  cost: number;
}

export function CategorySpendChart({
  chartId,
  title,
  items,
  color,
  currency,
  rates,
  initialChartType,
}: {
  chartId: string;
  title: string;
  items: CostItem[];
  color: string;
  currency: Currency;
  rates: ExchangeRates | null;
  initialChartType?: 'bar' | 'line';
}) {
  const { range } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(chartId, initialChartType ?? 'bar');
  const symbol = CURRENCY_SYMBOLS[currency];

  // Bucketed here, client-side, from the raw items - reacts to the shared
  // Range control instantly rather than showing a fixed server-computed
  // view that can never change after the page loads.
  const data = bucketByMonth(filterByDateRange(items, range));
  const labels = data.map((d) => d.month);
  const dataValues = data.map((d) => convertGbpToDisplay(d.total, currency, rates));

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['bar', 'line']} />
      </div>
      {data.length < 2 ? (
        <p className={styles.emptyNote}>Not enough data in this range to chart yet.</p>
      ) : kind === 'line' ? (
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
            datasets: [{ data: dataValues, backgroundColor: barGradient(color), borderRadius: BAR_BORDER_RADIUS }],
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
