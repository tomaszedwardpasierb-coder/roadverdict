// Place at: src/app/dashboard/CategorySpendChart.tsx
'use client';

import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import type { MonthlyTotal } from '@/lib/tracker/summary';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function CategorySpendChart({ data, color }: { data: MonthlyTotal[]; color: string }) {
  return (
    <Bar
      data={{
        labels: data.map((d) => d.month),
        datasets: [{ data: data.map((d) => d.total), backgroundColor: color }],
      }}
      options={{
        maintainAspectRatio: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: '#00000012' }, ticks: { font: { size: 10 } } },
        },
      }}
    />
  );
}
