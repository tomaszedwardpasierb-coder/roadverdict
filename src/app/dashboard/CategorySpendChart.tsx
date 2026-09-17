// Place at: src/app/dashboard/CategorySpendChart.tsx
'use client';

import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler } from 'chart.js';
import { bucketByMonth, bucketByMileage } from '@/lib/tracker/summary';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { convertMilesToDisplay, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS, lineAreaGradient, lastPointRadius, lastPointRing, lastPointRingWidth, dashedValueAxis, plainCategoryAxis } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import { useTabSwitch, viewRecords, type ReviewCategory } from './TabSwitchContext';
import type { CategoryForecast, ForecastWindow } from '@/lib/tracker/costForecast';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Filler);

interface CostItem {
  id: string;
  date: string;
  cost: number;
  mileage?: number;
}

export function CategorySpendChart({
  chartId,
  title,
  items,
  category,
  color,
  currency,
  rates,
  distanceUnit,
  supportsMileageView = true,
  initialChartType,
  vehicleKind = 'bike',
  forecast,
}: {
  chartId: string;
  title: string;
  items: CostItem[];
  // Which tab a click should jump to. A separate explicit prop rather
  // than parsing it out of chartId, so this never silently breaks if
  // chartId's naming convention ever changes.
  category: ReviewCategory;
  color: string;
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  // false for anything not logged against a mileage reading (Bills) - that
  // chart always shows by date regardless of the shared toggle, with a
  // note explaining why, rather than silently ignoring the setting.
  supportsMileageView?: boolean;
  initialChartType?: 'bar' | 'line';
  vehicleKind?: 'bike' | 'car';
  // Already computed server-side (costForecast.ts/carCostForecast.ts),
  // for all three windows at once - page.tsx is a server component and
  // has no way to know which window is currently selected (that's
  // client-side state, see ChartFilterContext), so the cheap fix is
  // computing all three up front rather than round-tripping to the
  // server every time someone switches windows. This component never
  // computes a projection itself, only picks and renders the one it's
  // handed for the currently active window, same division of labour as
  // `items` (the real data) above. Undefined for charts with no forecast
  // method wired up yet.
  forecast?: Record<ForecastWindow, CategoryForecast>;
}) {
  const { switchTo, setHighlightIds } = useTabSwitch();
  const { range, viewBy, forecastMode, forecastWindow } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(chartId, initialChartType ?? 'bar', vehicleKind);
  const symbol = CURRENCY_SYMBOLS[currency];
  const usingMileageView = supportsMileageView && viewBy === 'mileage';
  const activeForecast = forecast?.[forecastWindow];
  // Forecast is always calendar-based - there's no "future mileage band"
  // that means anything, so it's shown as if range were "all" (the whole
  // real trend leading up to today, for context) and mileage view simply
  // doesn't apply. ChartFilterBar already hides both controls while
  // forecastMode is on; this is the belt-and-braces version in case
  // `range`/`viewBy` are still holding a stale value from before it was
  // switched on.
  const showingForecast = forecastMode && !!activeForecast;

  const filteredItems = filterByDateRange(items, showingForecast ? 'all' : range);

  let labels: string[];
  let dataValues: number[];
  let bucketIds: string[][];

  if (usingMileageView && !showingForecast) {
    const withMileage = filteredItems.filter((i): i is CostItem & { mileage: number } => i.mileage != null);
    const bands = bucketByMileage(withMileage);
    labels = bands.map(
      (b) => `${Math.round(convertMilesToDisplay(b.bandStart, distanceUnit))}-${Math.round(convertMilesToDisplay(b.bandEnd, distanceUnit))} ${distanceUnitLabel(distanceUnit)}`
    );
    dataValues = bands.map((b) => convertGbpToDisplay(b.total, currency, rates));
    bucketIds = bands.map((b) => b.ids);
  } else {
    const months = bucketByMonth(filteredItems);
    labels = months.map((m) => m.month);
    dataValues = months.map((m) => convertGbpToDisplay(m.total, currency, rates));
    bucketIds = months.map((m) => m.ids);
  }

  // The real, already-logged months end here - everything from this
  // index onward in the combined arrays below is a projection, never a
  // recorded transaction. Used to style forecast points/bars distinctly
  // (dashed line segments, lighter bars) and to keep handleBarClick a
  // no-op on them, since there's no real record to jump to.
  const pastCount = labels.length;
  if (showingForecast) {
    for (const point of activeForecast!.points) {
      labels = [...labels, point.month];
      dataValues = [...dataValues, convertGbpToDisplay(point.total, currency, rates)];
      bucketIds = [...bucketIds, []];
    }
  }

  // A bucket here can be several records summed together, so a click
  // switches tabs and highlights every one of them (scrolling to the
  // first) rather than pretending there's a single record to jump to.
  // Forecast points have no bucketIds at all (see the loop above), so
  // this is already naturally a no-op on them without any extra check.
  function handleBarClick(elements: { index: number }[]) {
    if (elements.length === 0) return;
    const ids = bucketIds[elements[0].index];
    if (ids?.length) viewRecords(category, ids, switchTo, setHighlightIds);
  }

  function handleHover(event: { native: Event | null }, elements: unknown[]) {
    const target = event.native?.target as HTMLElement | undefined;
    if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  }

  // One fixed colour for every forecast segment/bar, on every chart,
  // regardless of that chart's own category colour - so "blue and
  // dashed" reads as "this is a projection" everywhere in the app the
  // same way, not just on this one chart. Matches --blue in globals.css;
  // Chart.js options can't read CSS custom properties directly.
  const FORECAST_COLOR = '#4A5FBF';
  const isForecastSegment = (p0DataIndex: number) => showingForecast && p0DataIndex >= pastCount - 1;
  const isForecastIndex = (dataIndex: number) => showingForecast && dataIndex >= pastCount;
  // "Today" - the last real, already-logged point - gets the same
  // stand-out ring treatment the true last point normally gets, so it
  // still reads as "you are here" even though it's no longer the last
  // point in the dataset once a forecast is appended after it.
  const anchorIndex = showingForecast ? pastCount - 1 : labels.length - 1;

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {showingForecast && <span className={styles.forecastBadge}>Estimate</span>}
          <ChartTypeToggle value={kind} onChange={changeKind} options={['bar', 'line']} />
        </div>
      </div>
      {!supportsMileageView && viewBy === 'mileage' && !showingForecast && (
        <p className="field-note" style={{ marginBottom: '0.6rem' }}>
          Shown by date - this isn&apos;t logged against a mileage reading.
        </p>
      )}
      {labels.length < 2 ? (
        <p className={styles.emptyNote}>Not enough data in this range to chart yet.</p>
      ) : kind === 'line' ? (
        <Line
          data={{
            labels,
            datasets: [
              {
                data: dataValues,
                borderColor: color,
                backgroundColor: lineAreaGradient(color),
                borderWidth: 2.4,
                borderCapStyle: 'round',
                borderJoinStyle: 'round',
                tension: 0.25,
                fill: true,
                pointRadius: (ctx) => (ctx.dataIndex === anchorIndex ? 5 : isForecastIndex(ctx.dataIndex) ? 3 : lastPointRadius(2, 5)(ctx)),
                pointBorderColor: (ctx) => (ctx.dataIndex === anchorIndex ? '#fff' : isForecastIndex(ctx.dataIndex) ? FORECAST_COLOR : lastPointRing(color)(ctx)),
                pointBorderWidth: (ctx) => (ctx.dataIndex === anchorIndex ? 2 : lastPointRingWidth(0, 2)(ctx)),
                pointBackgroundColor: (ctx) => (isForecastIndex(ctx.dataIndex) ? FORECAST_COLOR : color),
                segment: {
                  borderDash: (ctx) => (isForecastSegment(ctx.p0DataIndex) ? [6, 4] : undefined),
                  borderColor: (ctx) => (isForecastSegment(ctx.p0DataIndex) ? FORECAST_COLOR : undefined),
                },
              },
            ],
          }}
          options={{
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${isForecastIndex(ctx.dataIndex) ? 'Est. ' : ''}${symbol}${Math.round(ctx.parsed.y as number)}`,
                },
              },
            },
            scales: {
              x: plainCategoryAxis(),
              y: dashedValueAxis({ ticks: { callback: (value: number | string) => `${symbol}${value}` } }),
            },
            onClick: (_evt, elements) => handleBarClick(elements),
            onHover: handleHover,
          }}
        />
      ) : (
        <Bar
          data={{
            labels,
            datasets: [
              {
                data: dataValues,
                backgroundColor: (ctx) => (isForecastIndex(ctx.dataIndex ?? -1) ? 'rgba(74, 95, 191, 0.14)' : barGradient(color)(ctx)),
                borderColor: (ctx) => (isForecastIndex(ctx.dataIndex ?? -1) ? FORECAST_COLOR : 'transparent'),
                borderWidth: (ctx) => (isForecastIndex(ctx.dataIndex ?? -1) ? 2 : 0),
                borderRadius: BAR_BORDER_RADIUS,
              },
            ],
          }}
          options={{
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${isForecastIndex(ctx.dataIndex) ? 'Est. ' : ''}${symbol}${Math.round(ctx.parsed.y as number)}`,
                },
              },
            },
            scales: {
              x: plainCategoryAxis(),
              y: dashedValueAxis({ ticks: { callback: (value: number | string) => `${symbol}${value}` } }),
            },
            onClick: (_evt, elements) => handleBarClick(elements),
            onHover: handleHover,
          }}
        />
      )}
      {showingForecast && activeForecast?.basis && <p className={styles.forecastBasis}>{activeForecast.basis}</p>}
    </div>
  );
}
