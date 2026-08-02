// Place at: src/app/dashboard/SpendDonutChart.tsx
'use client';

import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import styles from './dashboard.module.css';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const CHART_ID = 'spend-donut';
const COLORS = ['#1a1a1a', '#e8a33d', '#3d8b6f', '#6b5b95'];
const LABELS = ['Servicing & repairs', 'Modifications', 'Fuel', 'Insurance/tax/MOT'];

interface CostItem {
  date: string;
  cost: number;
}

interface Props {
  records: CostItem[];
  mods: CostItem[];
  fuelLogs: CostItem[];
  bills: CostItem[];
  currency: Currency;
  rates: ExchangeRates | null;
  initialChartType?: 'bar' | 'pie';
}

function sumCost(items: CostItem[]): number {
  return items.reduce((sum, i) => sum + i.cost, 0);
}

// Receives raw, unfiltered records - the range-based totals are computed
// here, inside the chart, from whichever Range the shared filter bar is
// currently set to. This is why this component (and CategorySpendChart)
// now take raw arrays instead of pre-summed totals: a pre-summed number
// computed once on the server has no way to react to the client-side
// Range control changing after the page has already loaded.
export function SpendDonutChart({ records, mods, fuelLogs, bills, currency, rates, initialChartType }: Props) {
  const { range } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'pie');
  const symbol = CURRENCY_SYMBOLS[currency];

  const servicingTotal = sumCost(filterByDateRange(records, range));
  const modsTotal = sumCost(filterByDateRange(mods, range));
  const fuelTotal = sumCost(filterByDateRange(fuelLogs, range));
  const billsTotal = sumCost(filterByDateRange(bills, range));
  const grandTotal = servicingTotal + modsTotal + fuelTotal + billsTotal;

  const rawValues = [servicingTotal, modsTotal, fuelTotal, billsTotal];
  const values = rawValues.map((v) => convertGbpToDisplay(v, currency, rates));

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>Spend by category</span>
        <ChartTypeToggle value={kind === 'bar' ? 'bar' : 'pie'} onChange={changeKind} options={['pie', 'bar']} />
      </div>
      {grandTotal <= 0 ? (
        <p className={styles.emptyNote}>Nothing logged in this range.</p>
      ) : (
        <div style={{ position: 'relative', flex: 1 }}>
          {kind === 'bar' ? (
            <Bar
              data={{
                labels: LABELS,
                datasets: [
                  {
                    data: values,
                    backgroundColor: (ctx) => barGradient(COLORS[ctx.dataIndex % COLORS.length])(ctx),
                    borderRadius: BAR_BORDER_RADIUS,
                  },
                ],
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
      )}
    </div>
  );
}
