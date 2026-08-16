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
// Fixed order per the design system, not arbitrary - Ink, Amber, Green,
// Slate. The previous purple on Insurance/tax/MOT was a genuine bug,
// not a style choice - slate is correct even when this segment is £0,
// which is why it's never dropped from the ring or legend.
const COLORS = ['#1C1D20', '#EE9A2E', '#21815A', '#8A867D'];
const LABELS = ['Servicing & repairs', 'Modifications', 'Fuel', 'Insurance/tax/MOT'];
const DONUT_CUTOUT = '68%';

// Draws the centre total directly on the canvas at the donut ring's own
// true centre point, read from Chart.js's own arc geometry - not a
// CSS 50%/50% wrapper midpoint, which only matches the ring's real
// centre when nothing else (like a right-hand legend) eats into the
// canvas's width. Robust regardless of legend size, unlike a fixed
// CSS position would be.
function makeCenterTextPlugin(totalText: string) {
  return {
    id: 'donutCenterText',
    afterDraw(chart: ChartJS) {
      const meta = chart.getDatasetMeta(0);
      const arc = meta.data[0] as unknown as { getCenterPoint?: () => { x: number; y: number } };
      const center = arc?.getCenterPoint?.();
      if (!center) return;
      const { ctx } = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = "600 21px 'IBM Plex Mono', 'Courier New', monospace";
      ctx.fillStyle = '#1C1D20';
      ctx.fillText(totalText, center.x, center.y - 9);
      ctx.font = "11px 'IBM Plex Sans', system-ui, sans-serif";
      ctx.fillStyle = '#8A867D';
      ctx.fillText('TOTAL', center.x, center.y + 13);
      ctx.restore();
    },
  };
}

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
                // No border/stroke between segments per the design
                // system - flat fill colours, no gaps.
                labels: LABELS,
                datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 0 }],
              }}
              plugins={[makeCenterTextPlugin(`${symbol}${Math.round(values.reduce((a, b) => a + b, 0))}`)]}
              options={{
                cutout: DONUT_CUTOUT,
                plugins: {
                  legend: {
                    position: 'right',
                    labels: {
                      boxWidth: 10,
                      boxHeight: 10,
                      padding: 14,
                      font: { size: 11, family: "'IBM Plex Sans', system-ui, sans-serif" },
                      // Chart.js's default legend only shows the label -
                      // the design system wants the value alongside it,
                      // in mono, so this overrides the generated text
                      // per entry rather than replacing the legend
                      // entirely.
                      generateLabels: (chart) => {
                        const data = chart.data;
                        return (data.labels ?? []).map((label, i) => {
                          const val = (data.datasets[0].data[i] as number) ?? 0;
                          return {
                            text: `${label}  ${symbol}${Math.round(val)}`,
                            fillStyle: COLORS[i],
                            strokeStyle: COLORS[i],
                            fontColor: '#54555A',
                            index: i,
                          };
                        });
                      },
                    },
                  },
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
