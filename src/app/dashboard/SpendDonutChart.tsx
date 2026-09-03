// Place at: src/app/dashboard/SpendDonutChart.tsx
'use client';

import Link from 'next/link';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import { Icon } from './Icon';
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
// Fixed box size matching the reference design exactly (132px, ~68%
// cutout) - the legend used to be drawn by Chart.js inside the same
// canvas as the ring, which meant the ring's true centre shifted left
// or right depending on how much horizontal space the legend text
// happened to need, and had to be re-measured after every draw to keep
// the centre total lined up with it. Rendering the legend as plain
// HTML next to a fixed-size canvas removes that dependency entirely:
// the ring is now always dead-centre of its own box, so the total can
// be centred with plain CSS instead of tracked in JS.
const DONUT_BOX_SIZE = 132;

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
  // Free plan keeps the shape (relative bar heights / ring proportions)
  // and the grand total visible - that's the "yes, this actually works"
  // proof. Only the category breakdown itself (which category, and how
  // much each one cost) is Premium.
  isPro?: boolean;
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
export function SpendDonutChart({ records, mods, fuelLogs, bills, currency, rates, initialChartType, isPro = false }: Props) {
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
      {grandTotal > 0 && (
        <div className={styles.chartCardTotalLine}>
          Total: <strong>{symbol}{Math.round(values.reduce((a, b) => a + b, 0))}</strong>
        </div>
      )}
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
                  // The category breakdown (which one, and how much) is
                  // Premium - free plan keeps the bars' relative heights
                  // visible (that's the chart/shape), but the tooltip
                  // and axis ticks that would name a category or read
                  // off its exact value are switched off entirely.
                  tooltip: isPro
                    ? { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } }
                    : { enabled: false },
                },
                scales: {
                  x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, callback: (_value, index) => (isPro ? LABELS[index] : '🔒') },
                  },
                  y: {
                    grid: { color: '#00000012' },
                    ticks: isPro ? { callback: (value) => `${symbol}${value}` } : { display: false },
                  },
                },
              }}
            />
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.4rem' }}>
                <div style={{ position: 'relative', width: `${DONUT_BOX_SIZE}px`, height: `${DONUT_BOX_SIZE}px`, flexShrink: 0 }}>
                <Doughnut
                  data={{
                    // No border/stroke between segments per the design
                    // system - flat fill colours, no gaps.
                    labels: LABELS,
                    datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 0 }],
                  }}
                  options={{
                    cutout: DONUT_CUTOUT,
                    plugins: {
                      // The legend is now real HTML rendered next to
                      // this box (below), not drawn by Chart.js inside
                      // the canvas - see the note on DONUT_BOX_SIZE
                      // above for why.
                      legend: { display: false },
                      tooltip: isPro
                        ? { callbacks: { label: (ctx) => `${ctx.label}: ${symbol}${Math.round(ctx.parsed as number)}` } }
                        : { enabled: false },
                    },
                    maintainAspectRatio: false,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", fontWeight: 600, fontSize: '16px', color: '#1C1D20' }}>
                    {symbol}{Math.round(values.reduce((a, b) => a + b, 0))}
                  </div>
                  <div
                    style={{
                      fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                      fontSize: '9px',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      color: '#8A867D',
                      marginTop: '1px',
                    }}
                  >
                    Total
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', flex: 1, minWidth: 0 }}>
                {isPro ? (
                  LABELS.map((label, i) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: COLORS[i], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--ink-soft)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                        {symbol}{Math.round(values[i])}
                      </span>
                    </div>
                  ))
                ) : (
                  LABELS.map((_, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                      <span style={{ width: '9px', height: '9px', borderRadius: '3px', background: COLORS[i], flexShrink: 0 }} />
                      <span style={{ flex: 1, color: 'var(--ink-soft)' }}>••••••••</span>
                      <Icon name="lock" size={11} />
                    </div>
                  ))
                )}
              </div>
            </div>
              {!isPro && (
                <Link href="/pro" className={styles.categoryLockedNote}>
                  <Icon name="lock" size={12} /> Category breakdown - Premium
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
