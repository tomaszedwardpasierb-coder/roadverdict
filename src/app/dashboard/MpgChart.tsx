// Place at: src/app/dashboard/MpgChart.tsx
'use client';

import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js';
import type { MpgSegment } from '@/lib/tracker/fuelLog';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export function MpgChart({ series }: { series: MpgSegment[] }) {
  const data = {
    labels: series.map((s) => `${s.mileage.toLocaleString()} mi`),
    datasets: [
      {
        label: 'MPG',
        data: series.map((s) => Number(s.mpg.toFixed(1))),
        borderColor: '#e8a33d',
        backgroundColor: '#e8a33d22',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
      },
    ],
  };

  return (
    <Line
      data={data}
      options={{
        plugins: { legend: { display: false } },
        scales: { y: { title: { display: true, text: 'mpg' } } },
        maintainAspectRatio: true,
      }}
    />
  );
}
