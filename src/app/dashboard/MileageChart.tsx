// Place at: src/app/dashboard/MileageChart.tsx
'use client';

import { useMemo } from 'react';
import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler } from 'chart.js';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import type { MileagePoint } from '@/lib/tracker/summary';
import { convertMilesToDisplay, distanceUnitLabel, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS, lineAreaGradient, lastPointRadius, lastPointRing, lastPointRingWidth, dashedValueAxis, plainCategoryAxis, FORECAST_COLOR } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import { useTabSwitch, viewRecords } from './TabSwitchContext';
import type { ForecastWindow, ForecastMonthPoint } from '@/lib/tracker/costForecast';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const CHART_ID = 'mileage';
const MILEAGE_COLOR = '#EE9A2E'; // matches --amber - fixed colour-per-metric mapping, mileage is always amber

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function MileageChart({
  points,
  distanceUnit,
  initialChartType,
  vehicleKind = 'bike',
  forecast,
}: {
  points: MileagePoint[];
  distanceUnit: DistanceUnit;
  initialChartType?: 'line' | 'bar';
  vehicleKind?: 'bike' | 'car';
  // Projected mileage OVER TIME for each forecast window, precomputed
  // server-side (see costForecast.ts's projectMileageOverWindow) - same
  // "all windows up front" pattern CategorySpendChart's own `forecast`
  // prop uses, since forecastWindow is client-side state page.tsx can't
  // read at render time. One point per future month for a whole-month
  // window (6m/1y), collapsing to the window's own single point for a
  // sub-month window (1w/1m) - see projectMileageOverWindow's own
  // comment on why.
  forecast?: Record<ForecastWindow, ForecastMonthPoint[]>;
}) {
  const { switchTo, setHighlightIds } = useTabSwitch();
  const { range, forecastMode, forecastWindow } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line', vehicleKind);
  const activeForecast = forecast?.[forecastWindow];
  const showingForecast = forecastMode && !!activeForecast;
  const title = `${distanceUnit === 'km' ? 'Kilometres' : 'Mileage'} over time`;

  // Filtering, unit conversion, and forecast-merging re-done on every
  // render otherwise - memoized so an unrelated re-render doesn't redo
  // this work on the full points array again.
  const { filtered, labels, dataValues, pastCount, anchorIndex } = useMemo(() => {
    const filtered = filterByDateRange(points, showingForecast ? 'all' : range);
    let dataValues = filtered.map((p) => Math.round(convertMilesToDisplay(p.mileage, distanceUnit)));
    let labels = filtered.map((p) => fmtDate(p.date));

    // The real, already-logged points end here - everything appended after
    // it is a projection, never a recorded reading. Used to style the
    // forecast segment/points distinctly and to keep handlePointClick a
    // no-op on them, since `filtered` (what the click handler indexes
    // into) never grows past the real points.
    const pastCount = labels.length;
    if (showingForecast) {
      for (const point of activeForecast!) {
        labels = [...labels, point.month];
        dataValues = [...dataValues, Math.round(convertMilesToDisplay(point.total, distanceUnit))];
      }
    }
    // "Today" - the last real, already-logged point - gets the same
    // stand-out ring treatment the true last point normally gets, so it
    // still reads as "you are here" even though it's no longer the last
    // point in the dataset once a forecast point is appended after it.
    const anchorIndex = showingForecast ? pastCount - 1 : labels.length - 1;

    return { filtered, labels, dataValues, pastCount, anchorIndex };
  }, [points, range, showingForecast, distanceUnit, activeForecast]);

  const isForecastIndex = (dataIndex: number) => showingForecast && dataIndex >= pastCount;
  const isForecastSegment = (p0DataIndex: number) => showingForecast && p0DataIndex >= pastCount - 1;

  function handlePointClick(elements: { index: number }[]) {
    if (elements.length === 0) return;
    const point = filtered[elements[0].index];
    // MOT-derived points aren't a real dashboard tab of their own - they
    // live in the same "Insurance, tax & MOT" (bills) tab as everything
    // else in that section, same mapping ReviewQueueModal.tsx already
    // uses for the equivalent scan-category mismatch.
    const reviewCategory = point?.category === 'mot' ? 'bills' : point?.category;
    if (point?.id && reviewCategory) viewRecords(reviewCategory, [point.id], switchTo, setHighlightIds);
  }

  function handleHover(event: { native: Event | null }, elements: unknown[]) {
    const target = event.native?.target as HTMLElement | undefined;
    if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  }

  const unitSuffix = distanceUnitLabel(distanceUnit);

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {showingForecast && <span className={styles.forecastBadge}>Estimate</span>}
          <ChartTypeToggle value={kind} onChange={changeKind} options={['line', 'bar']} />
        </div>
      </div>
      {labels.length < 2 ? (
        <p className={styles.emptyNote}>No entries logged in this time range.</p>
      ) : kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: 'Mileage',
                data: dataValues,
                backgroundColor: (ctx) => (isForecastIndex(ctx.dataIndex ?? -1) ? 'rgba(74, 95, 191, 0.14)' : barGradient(MILEAGE_COLOR)(ctx)),
                borderColor: (ctx) => (isForecastIndex(ctx.dataIndex ?? -1) ? FORECAST_COLOR : 'transparent'),
                borderWidth: (ctx) => (isForecastIndex(ctx.dataIndex ?? -1) ? 2 : 0),
                borderRadius: BAR_BORDER_RADIUS,
              },
            ],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${isForecastIndex(ctx.dataIndex) ? 'Est. ' : ''}${ctx.parsed.y} ${unitSuffix}` } },
            },
            scales: {
              y: dashedValueAxis({ title: { display: true, text: unitSuffix } }),
              x: plainCategoryAxis(),
            },
            onClick: (_evt, elements) => handlePointClick(elements),
            onHover: handleHover,
            maintainAspectRatio: true,
          }}
        />
      ) : (
        <Line
          data={{
            labels,
            datasets: [
              {
                label: 'Mileage',
                data: dataValues,
                borderColor: MILEAGE_COLOR,
                backgroundColor: lineAreaGradient(MILEAGE_COLOR),
                borderWidth: 2.4,
                borderCapStyle: 'round',
                borderJoinStyle: 'round',
                tension: 0.2,
                fill: true,
                pointRadius: (ctx) => (ctx.dataIndex === anchorIndex ? 5 : isForecastIndex(ctx.dataIndex) ? 3 : lastPointRadius(2, 5)(ctx)),
                pointBorderColor: (ctx) => (ctx.dataIndex === anchorIndex ? '#fff' : isForecastIndex(ctx.dataIndex) ? FORECAST_COLOR : lastPointRing(MILEAGE_COLOR)(ctx)),
                pointBorderWidth: (ctx) => (ctx.dataIndex === anchorIndex ? 2 : lastPointRingWidth(0, 2)(ctx)),
                pointBackgroundColor: (ctx) => (isForecastIndex(ctx.dataIndex) ? FORECAST_COLOR : MILEAGE_COLOR),
                segment: {
                  borderDash: (ctx) => (isForecastSegment(ctx.p0DataIndex) ? [6, 4] : undefined),
                  borderColor: (ctx) => (isForecastSegment(ctx.p0DataIndex) ? FORECAST_COLOR : undefined),
                },
              },
            ],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${isForecastIndex(ctx.dataIndex) ? 'Est. ' : ''}${ctx.parsed.y} ${unitSuffix}` } },
            },
            scales: {
              y: dashedValueAxis({ title: { display: true, text: unitSuffix } }),
              x: plainCategoryAxis(),
            },
            onClick: (_evt, elements) => handlePointClick(elements),
            onHover: handleHover,
            maintainAspectRatio: true,
          }}
        />
      )}
    </div>
  );
}
