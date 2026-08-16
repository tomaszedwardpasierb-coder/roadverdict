// Place at: src/app/dashboard/FuelCostChart.tsx
'use client';

import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from 'chart.js';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatDistance, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS, lineAreaGradient, lastPointRadius, lastPointRing, lastPointRingWidth, dashedValueAxis, plainCategoryAxis } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import { useTabSwitch, viewRecords } from './TabSwitchContext';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const CHART_ID = 'fuel-cost';
const FUEL_COLOR = '#21815A'; // matches --green - fixed colour-per-metric mapping, fuel is always green

interface FuelPoint {
  id: string;
  date: string;
  cost: number;
  mileage: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FuelCostChart({
  points,
  currency,
  rates,
  distanceUnit,
  initialChartType,
}: {
  points: FuelPoint[];
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  initialChartType?: 'line' | 'bar';
}) {
  const { switchTo, setHighlightIds } = useTabSwitch();
  const { range, viewBy } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line');
  const dateFiltered = filterByDateRange(points, range);
  const filtered =
    viewBy === 'mileage'
      ? [...dateFiltered].sort((a, b) => a.mileage - b.mileage)
      : [...dateFiltered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const symbol = CURRENCY_SYMBOLS[currency];
  const labels = viewBy === 'mileage' ? filtered.map((p) => formatDistance(p.mileage, distanceUnit)) : filtered.map((p) => fmtDate(p.date));
  const dataValues = filtered.map((p) => convertGbpToDisplay(p.cost, currency, rates));

  function handlePointClick(elements: { index: number }[]) {
    if (elements.length === 0) return;
    const point = filtered[elements[0].index];
    if (point?.id) viewRecords('fuel', [point.id], switchTo, setHighlightIds);
  }

  function handleHover(event: { native: Event | null }, elements: unknown[]) {
    const target = event.native?.target as HTMLElement | undefined;
    if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  }

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>Fuel cost over time</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['line', 'bar']} />
      </div>
      {filtered.length === 0 ? (
        <p className={styles.emptyNote}>No fuel fill-ups logged in this time range.</p>
      ) : kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [{ label: `Fuel cost per fill-up (${symbol})`, data: dataValues, backgroundColor: barGradient(FUEL_COLOR), borderRadius: BAR_BORDER_RADIUS }],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${(ctx.parsed.y as number).toFixed(2)}` } },
            },
            scales: {
              y: dashedValueAxis({ ticks: { callback: (value: number | string) => `${symbol}${value}` } }),
              x: plainCategoryAxis(),
            },
            onClick: (_evt, elements) => handlePointClick(elements),
            onHover: handleHover,
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
                borderColor: FUEL_COLOR,
                backgroundColor: lineAreaGradient(FUEL_COLOR),
                borderWidth: 2.4,
                borderCapStyle: 'round',
                borderJoinStyle: 'round',
                tension: 0.3,
                fill: true,
                pointRadius: lastPointRadius(2, 5),
                pointBorderColor: lastPointRing(FUEL_COLOR),
                pointBorderWidth: lastPointRingWidth(0, 2),
                pointBackgroundColor: FUEL_COLOR,
              },
            ],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${(ctx.parsed.y as number).toFixed(2)}` } },
            },
            scales: {
              y: dashedValueAxis({ ticks: { callback: (value: number | string) => `${symbol}${value}` } }),
              x: plainCategoryAxis(),
            },
            onClick: (_evt, elements) => handlePointClick(elements),
            onHover: handleHover,
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
