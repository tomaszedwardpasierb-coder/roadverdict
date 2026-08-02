// Place at: src/app/dashboard/CategorySpendChart.tsx
'use client';

import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip } from 'chart.js';
import { bucketByMonth, bucketByMileage } from '@/lib/tracker/summary';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { convertMilesToDisplay, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip);

interface CostItem {
  date: string;
  cost: number;
  mileage?: number;
}

export function CategorySpendChart({
  chartId,
  title,
  items,
  color,
  currency,
  rates,
  distanceUnit,
  supportsMileageView = true,
  initialChartType,
}: {
  chartId: string;
  title: string;
  items: CostItem[];
  color: string;
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  // false for anything not logged against a mileage reading (Bills) - that
  // chart always shows by date regardless of the shared toggle, with a
  // note explaining why, rather than silently ignoring the setting.
  supportsMileageView?: boolean;
  initialChartType?: 'bar' | 'line';
}) {
  const { range, viewBy } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(chartId, initialChartType ?? 'bar');
  const symbol = CURRENCY_SYMBOLS[currency];
  const usingMileageView = supportsMileageView && viewBy === 'mileage';

  const filteredItems = filterByDateRange(items, range);

  let labels: string[];
  let dataValues: number[];

  if (usingMileageView) {
    const withMileage = filteredItems.filter((i): i is CostItem & { mileage: number } => i.mileage != null);
    const bands = bucketByMileage(withMileage);
    labels = bands.map(
      (b) => `${Math.round(convertMilesToDisplay(b.bandStart, distanceUnit))}-${Math.round(convertMilesToDisplay(b.bandEnd, distanceUnit))} ${distanceUnitLabel(distanceUnit)}`
    );
    dataValues = bands.map((b) => convertGbpToDisplay(b.total, currency, rates));
  } else {
    const months = bucketByMonth(filteredItems);
    labels = months.map((m) => m.month);
    dataValues = months.map((m) => convertGbpToDisplay(m.total, currency, rates));
  }

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['bar', 'line']} />
      </div>
      {!supportsMileageView && viewBy === 'mileage' && (
        <p className="field-note" style={{ marginBottom: '0.6rem' }}>
          Shown by date - this isn&apos;t logged against a mileage reading.
        </p>
      )}
      {labels.length < 2 ? (
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
