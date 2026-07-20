// Place at: src/app/dashboard/FuelCostChart.tsx
'use client';

import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import { RANGE_OPTIONS, filterByDateRange, type RangeValue } from '@/lib/tracker/dateRange';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface FuelPoint {
  date: string;
  cost: number;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function FuelCostChart({ points }: { points: FuelPoint[] }) {
  const [range, setRange] = useState<RangeValue>('all');
  const filtered = filterByDateRange(points, range).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      {filtered.length === 0 ? (
        <p className={styles.emptyNote}>No fuel fill-ups logged in this time range.</p>
      ) : (
        <Line
          data={{
            labels: filtered.map((p) => fmtDate(p.date)),
            datasets: [
              {
                label: 'Fuel cost per fill-up (£)',
                data: filtered.map((p) => Number(p.cost.toFixed(2))),
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
            plugins: { legend: { display: false } },
            scales: { y: { grid: { color: '#00000012' } }, x: { grid: { display: false } } },
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
