// Place at: src/app/dashboard/MpgChart.tsx
'use client';

import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import type { MpgSegment } from '@/lib/tracker/fuelLog';
import { formatDistance, type FuelEconomyUnit, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const CHART_ID = 'mpg';
const LITRES_PER_UK_GALLON = 4.546;
const KM_PER_MILE = 1.60934;

function convertMpgValue(mpg: number, unit: FuelEconomyUnit): number {
  if (unit === 'l100km') {
    return (LITRES_PER_UK_GALLON * 100) / (mpg * KM_PER_MILE);
  }
  return mpg;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MpgChart({
  series,
  fuelEconomyUnit,
  distanceUnit,
  initialChartType,
  currency,
  rates,
  excludedFuelEntries,
}: {
  series: MpgSegment[];
  fuelEconomyUnit: FuelEconomyUnit;
  distanceUnit: DistanceUnit;
  initialChartType?: 'line' | 'bar';
  currency: Currency;
  rates: ExchangeRates | null;
  excludedFuelEntries: { date: string; cost: number }[];
}) {
  const { range, viewBy } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line');
  const dateFiltered = filterByDateRange(series, range);
  // Same range the chart itself is currently showing, applied to the
  // excluded entries too - so the note below always reflects "how much
  // of what you're looking at right now was left out", not a lifetime
  // total that wouldn't match the chart on screen.
  const excludedInRange = filterByDateRange(excludedFuelEntries, range);
  const excludedSpend = excludedInRange.reduce((sum, e) => sum + e.cost, 0);
  // "series" arrives already sorted by mileage (computeMPGSeries's own
  // sort order) - for the Time view, re-sort by date instead, since the
  // two orders aren't guaranteed to match (a backdated entry, for
  // example).
  const filtered =
    viewBy === 'time' ? [...dateFiltered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) : dateFiltered;
  const title = `${fuelEconomyUnit === 'l100km' ? 'Fuel economy' : 'MPG'} over time`;
  const yLabel = fuelEconomyUnit === 'l100km' ? 'L/100km' : 'mpg';

  const labels = viewBy === 'time' ? filtered.map((s) => fmtDate(s.date)) : filtered.map((s) => formatDistance(s.mileage, distanceUnit));
  const dataValues = filtered.map((s) => Number(convertMpgValue(s.mpg, fuelEconomyUnit).toFixed(1)));

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['line', 'bar']} />
      </div>
      {filtered.length === 0 ? (
        <p className={styles.emptyNote}>No fill-ups logged in this time range.</p>
      ) : kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [{ label: fuelEconomyUnit === 'l100km' ? 'L/100km' : 'MPG', data: dataValues, backgroundColor: barGradient('#e8a33d'), borderRadius: BAR_BORDER_RADIUS }],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: {
              y: { title: { display: true, text: yLabel }, grid: { color: '#00000012' } },
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
                label: fuelEconomyUnit === 'l100km' ? 'L/100km' : 'MPG',
                data: dataValues,
                borderColor: '#e8a33d',
                backgroundColor: 'transparent',
                borderWidth: 1.25,
                tension: 0.25,
                fill: false,
                pointRadius: 2,
                pointBackgroundColor: '#e8a33d',
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: {
              y: { title: { display: true, text: yLabel }, grid: { color: '#00000012' } },
              x: { grid: { display: false } },
            },
            maintainAspectRatio: true,
          }}
        />
      )}
      {excludedSpend > 0 && (
        <p className={styles.mpgExcludedNote}>
          {formatCurrency(excludedSpend, currency, rates)} of fuel spend excluded from this calculation because the
          mileage on those entries hasn&apos;t been verified yet - edit them to confirm the mileage and they&apos;ll
          count from then on.
        </p>
      )}
    </div>
  );
}
