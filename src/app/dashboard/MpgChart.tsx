// Place at: src/app/dashboard/MpgChart.tsx
'use client';

import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import type { MpgSegment } from '@/lib/tracker/fuelLog';
import { formatDistance, type FuelEconomyUnit, type DistanceUnit } from '@/lib/tracker/unitFormat';
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

export function MpgChart({
  series,
  fuelEconomyUnit,
  distanceUnit,
  initialChartType,
}: {
  series: MpgSegment[];
  fuelEconomyUnit: FuelEconomyUnit;
  distanceUnit: DistanceUnit;
  initialChartType?: 'line' | 'bar';
}) {
  const { range } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line');
  const filtered = filterByDateRange(series, range);
  const title = `${fuelEconomyUnit === 'l100km' ? 'Fuel economy' : 'MPG'} over time`;
  const yLabel = fuelEconomyUnit === 'l100km' ? 'L/100km' : 'mpg';

  const labels = filtered.map((s) => formatDistance(s.mileage, distanceUnit));
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
    </div>
  );
}
