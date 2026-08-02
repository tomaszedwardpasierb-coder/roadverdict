// Place at: src/app/dashboard/SpendDonutChart.tsx
'use client';

import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import styles from './dashboard.module.css';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const CHART_ID = 'spend-donut';
const COLORS = ['#1a1a1a', '#e8a33d', '#3d8b6f', '#6b5b95'];
const LABELS = ['Servicing & repairs', 'Modifications', 'Fuel', 'Insurance/tax/MOT'];

interface Props {
  servicingTotal: number;
  modsTotal: number;
  fuelTotal: number;
  billsTotal: number;
  currency: Currency;
  rates: ExchangeRates | null;
  initialChartType?: 'bar' | 'pie';
}

export function SpendDonutChart({ servicingTotal, modsTotal, fuelTotal, billsTotal, currency, rates, initialChartType }: Props) {
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'pie');
  const symbol = CURRENCY_SYMBOLS[currency];
  const values = [
    convertGbpToDisplay(servicingTotal, currency, rates),
    convertGbpToDisplay(modsTotal, currency, rates),
    convertGbpToDisplay(fuelTotal, currency, rates),
    convertGbpToDisplay(billsTotal, currency, rates),
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>Spend by category</span>
        <ChartTypeToggle value={kind === 'bar' ? 'bar' : 'pie'} onChange={changeKind} options={['pie', 'bar']} />
      </div>
      <div style={{ position: 'relative', flex: 1 }}>
        {kind === 'bar' ? (
          <Bar
            data={{
              labels: LABELS,
              datasets: [{
                data: values,
                backgroundColor: (ctx) => barGradient(COLORS[ctx.dataIndex % COLORS.length])(ctx),
                borderRadius: BAR_BORDER_RADIUS,
              }],
            }}
            options={{
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } },
              },
              scales: {
                x: { grid: { display: false }, ticks: { font: { size: 10 } } },
                y: { grid: { color: '#00000012' }, ticks: { callback: (value) => `${symbol}${value}` } },
              },
            }}
          />
        ) : (
          <Doughnut
            data={{
              labels: LABELS,
              datasets: [{ data: values, backgroundColor: COLORS, borderColor: '#f7f6f2', borderWidth: 2 }],
            }}
            options={{
              plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, font: { size: 11 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${symbol}${Math.round(ctx.parsed as number)}` } },
              },
              maintainAspectRatio: false,
            }}
          />
        )}
      </div>
    </div>
  );
}
