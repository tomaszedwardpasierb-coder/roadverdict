// Place at: src/app/dashboard/SpendDonutChart.tsx
'use client';

import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Props {
  servicingTotal: number;
  modsTotal: number;
  fuelTotal: number;
  billsTotal: number;
}

export function SpendDonutChart({ servicingTotal, modsTotal, fuelTotal, billsTotal }: Props) {
  const data = {
    labels: ['Servicing & repairs', 'Modifications', 'Fuel', 'Insurance/tax/MOT'],
    datasets: [
      {
        data: [servicingTotal, modsTotal, fuelTotal, billsTotal],
        backgroundColor: ['#000000', '#e8a33d', '#4c7a4e', '#7a5211'],
        borderColor: '#f7f6f2',
        borderWidth: 2,
      },
    ],
  };

  return (
    <Doughnut
      data={data}
      options={{
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } } },
        maintainAspectRatio: true,
      }}
    />
  );
}
