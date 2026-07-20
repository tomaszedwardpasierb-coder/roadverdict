// Place at: src/app/dashboard/SpendOverTimeChart.tsx
'use client';

import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import type { MonthlySpend } from '@/lib/tracker/summary';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

export function SpendOverTimeChart({ data }: { data: MonthlySpend[] }) {
  return (
    <Bar
      data={{
        labels: data.map((d) => d.month),
        datasets: [
          { label: 'Servicing', data: data.map((d) => d.servicing), backgroundColor: '#1a1a1a' },
          { label: 'Mods', data: data.map((d) => d.mods), backgroundColor: '#e8a33d' },
          { label: 'Fuel', data: data.map((d) => d.fuel), backgroundColor: '#3d8b6f' },
          { label: 'Bills', data: data.map((d) => d.bills), backgroundColor: '#6b5b95' },
        ],
      }}
      options={{
        maintainAspectRatio: true,
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { stacked: true, grid: { color: '#00000012' }, ticks: { font: { size: 10 } } },
        },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
      }}
    />
  );
}
