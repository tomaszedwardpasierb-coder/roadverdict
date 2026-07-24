// Place at: src/app/dashboard/SpendDonutChart.tsx
'use client';

import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';

ChartJS.register(ArcElement, Tooltip, Legend);

interface Props {
  servicingTotal: number;
  modsTotal: number;
  fuelTotal: number;
  billsTotal: number;
  currency: Currency;
  rates: ExchangeRates | null;
}

export function SpendDonutChart({ servicingTotal, modsTotal, fuelTotal, billsTotal, currency, rates }: Props) {
  const symbol = CURRENCY_SYMBOLS[currency];
  const data = {
    labels: ['Servicing & repairs', 'Modifications', 'Fuel', 'Insurance/tax/MOT'],
    datasets: [
      {
        data: [
          convertGbpToDisplay(servicingTotal, currency, rates),
          convertGbpToDisplay(modsTotal, currency, rates),
          convertGbpToDisplay(fuelTotal, currency, rates),
          convertGbpToDisplay(billsTotal, currency, rates),
        ],
        backgroundColor: ['#1a1a1a', '#e8a33d', '#3d8b6f', '#6b5b95'],
        borderColor: '#f7f6f2',
        borderWidth: 2,
      },
    ],
  };

  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Doughnut
        data={data}
        options={{
          plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${symbol}${Math.round(ctx.parsed as number)}` } },
          },
          maintainAspectRatio: false,
        }}
      />
    </div>
  );
}
