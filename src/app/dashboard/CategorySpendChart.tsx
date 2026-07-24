// Place at: src/app/dashboard/CategorySpendChart.tsx
'use client';

import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from 'chart.js';
import type { MonthlyTotal } from '@/lib/tracker/summary';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

export function CategorySpendChart({
  data,
  color,
  currency,
  rates,
}: {
  data: MonthlyTotal[];
  color: string;
  currency: Currency;
  rates: ExchangeRates | null;
}) {
  const symbol = CURRENCY_SYMBOLS[currency];
  return (
    <Bar
      data={{
        labels: data.map((d) => d.month),
        datasets: [{ data: data.map((d) => convertGbpToDisplay(d.total, currency, rates)), backgroundColor: color }],
      }}
      options={{
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: { grid: { color: '#00000012' }, ticks: { font: { size: 10 }, callback: (value) => `${symbol}${value}` } },
        },
      }}
    />
  );
}
