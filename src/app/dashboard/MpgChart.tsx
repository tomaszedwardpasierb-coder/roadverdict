// Place at: src/app/dashboard/MpgChart.tsx
'use client';

import { useState } from 'react';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend } from 'chart.js';
import { RANGE_OPTIONS, filterByDateRange, type RangeValue } from '@/lib/tracker/dateRange';
import type { MpgSegment } from '@/lib/tracker/fuelLog';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

export function MpgChart({ series }: { series: MpgSegment[] }) {
  const [range, setRange] = useState<RangeValue>('all');
  const filtered = filterByDateRange(series, range);

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
        <p className={styles.emptyNote}>No fill-ups logged in this time range.</p>
      ) : (
        <Line
          data={{
            labels: filtered.map((s) => `${s.mileage.toLocaleString()} mi`),
            datasets: [
              {
                label: 'MPG',
                data: filtered.map((s) => Number(s.mpg.toFixed(1))),
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
              y: { title: { display: true, text: 'mpg' }, grid: { color: '#00000012' } },
              x: { grid: { display: false } },
            },
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
