// Place at: src/app/dashboard/MileageChart.tsx
'use client';

import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js';
import { RANGE_OPTIONS, filterByDateRange, type RangeValue } from '@/lib/tracker/dateRange';
import type { MileagePoint } from '@/lib/tracker/summary';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MileageChart({ points }: { points: MileagePoint[] }) {
  const [range, setRange] = useState<RangeValue>('all');
  const filtered = filterByDateRange(points, range);

  const data = {
    labels: filtered.map((p) => fmtDate(p.date)),
    datasets: [
      {
        label: 'Mileage',
        data: filtered.map((p) => p.mileage),
        borderColor: '#000000',
        backgroundColor: '#00000011',
        tension: 0.2,
        fill: true,
        pointRadius: 2,
      },
    ],
  };

  return (
    <div>
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
      {filtered.length < 2 ? (
        <p className={styles.emptyNote}>No entries logged in this time range.</p>
      ) : (
        <Line data={data} options={{ plugins: { legend: { display: false } }, maintainAspectRatio: true }} />
      )}
    </div>
  );
}
