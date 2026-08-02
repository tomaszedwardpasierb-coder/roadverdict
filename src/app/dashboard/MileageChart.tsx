// Place at: src/app/dashboard/MileageChart.tsx
'use client';

import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend } from 'chart.js';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import type { MileagePoint } from '@/lib/tracker/summary';
import { convertMilesToDisplay, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const CHART_ID = 'mileage';

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MileageChart({
  points,
  distanceUnit,
  initialChartType,
}: {
  points: MileagePoint[];
  distanceUnit: DistanceUnit;
  initialChartType?: 'line' | 'bar';
}) {
  const { range } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line');
  const filtered = filterByDateRange(points, range);
  const title = `${distanceUnit === 'km' ? 'Kilometres' : 'Mileage'} over time`;

  const dataValues = filtered.map((p) => Math.round(convertMilesToDisplay(p.mileage, distanceUnit)));
  const labels = filtered.map((p) => fmtDate(p.date));

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['line', 'bar']} />
      </div>
      {filtered.length < 2 ? (
        <p className={styles.emptyNote}>No entries logged in this time range.</p>
      ) : kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [{ label: 'Mileage', data: dataValues, backgroundColor: barGradient('#1a1a1a'), borderRadius: BAR_BORDER_RADIUS }],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: {
              y: { title: { display: true, text: distanceUnitLabel(distanceUnit) }, grid: { color: '#00000012' } },
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
                label: 'Mileage',
                data: dataValues,
                borderColor: '#000000',
                backgroundColor: 'transparent',
                borderWidth: 1.25,
                tension: 0.2,
                fill: false,
                pointRadius: 2,
                pointBackgroundColor: '#000000',
              },
            ],
          }}
          options={{
            plugins: { legend: { display: false } },
            scales: {
              y: { title: { display: true, text: distanceUnitLabel(distanceUnit) }, grid: { color: '#00000012' } },
              x: { grid: { display: false } },
            },
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
