// Place at: src/app/dashboard/SpendDonutChart.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

// Reads the donut ring's true centre point from Chart.js's own arc
// geometry, the same source of truth as before - but rather than
// drawing text directly on the canvas (ctx.fillText can drift from the
// visible ring under DPI/coordinate-space quirks that are hard to
// diagnose from outside the browser), this only ever captures a pixel
// position into React state. The actual text is a normal HTML element
// positioned with that value, sidestepping canvas text rendering
// entirely rather than trying to patch around it.
function makeCenterCapturePlugin(onCenter: (pos: { x: number; y: number }) => void) {
  return {
    id: 'donutCenterCapture',
    afterDraw(chart: ChartJS) {
      const meta = chart.getDatasetMeta(0);
      const arc = meta.data[0] as unknown as { getCenterPoint?: () => { x: number; y: number } };
      const center = arc?.getCenterPoint?.();
      if (!center) return;
      // Deferred to the next frame - calling setState synchronously
      // from inside Chart.js's own draw cycle risks updating React
      // state mid-render, which this avoids entirely.
      requestAnimationFrame(() => onCenter({ x: center.x, y: center.y }));
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
  const [centerPos, setCenterPos] = useState<{ x: number; y: number } | null>(null);
  // Memoized so the plugin instance is stable across renders - passing a
  // brand-new plugin object into Chart.js's plugins array every render
  // would make it think the plugin itself changed, not just re-run it.
  const centerCapturePlugin = useMemo(() => makeCenterCapturePlugin(setCenterPos), []);
  const chartRef = useRef<ChartJS<'doughnut', number[], string> | null>(null);

  // Clears any position captured by a previous mount of this chart (e.g.
  // switching to the bar view and back) so a stale coordinate never
  // flashes before the fresh one arrives. Chart.js also lays out the
  // legend - and therefore how much room is left for the ring - using
  // whatever font metrics are available the moment it first draws; if
  // the web font hasn't finished loading yet, that first pass uses a
  // fallback font's slightly different text width, and Chart.js never
  // re-measures on its own once the real font arrives, it only redraws
  // when update()/resize() is actually called. Forcing one update()
  // once fonts are confirmed ready makes it redo that layout pass (and
  // re-fire the centre-capture plugin below) against the real, final
  // metrics rather than the fallback-font estimate.
  useEffect(() => {
    setCenterPos(null);
    if (kind === 'bar') return;
    document.fonts?.ready?.then(() => {
      chartRef.current?.update();
    });
  }, [kind]);

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
            <>
              <Doughnut
              ref={chartRef}
              data={{
                // No border/stroke between segments per the design
                // system - flat fill colours, no gaps.
                labels: LABELS,
                datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 0 }],
              }}
              plugins={[centerCapturePlugin]}
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
            {centerPos && (
              <div
                style={{
                  position: 'absolute',
                  left: centerPos.x,
                  top: centerPos.y,
                  transform: 'translate(-50%, -50%)',
                  textAlign: 'center',
                  pointerEvents: 'none',
                }}
              >
                <div
                  style={{
                    fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
                    fontWeight: 600,
                    fontSize: '1.3rem',
                    color: '#1C1D20',
                  }}
                >
                  {symbol}{Math.round(values.reduce((a, b) => a + b, 0))}
                </div>
                <div
                  style={{
                    fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
                    fontSize: '0.7rem',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#8A867D',
                    marginTop: '0.1rem',
                  }}
                >
                  Total
                </div>
              </div>
            )}
          </>
          )}
        </div>
      )}
    </div>
  );
}
