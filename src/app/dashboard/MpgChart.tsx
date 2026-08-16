// Place at: src/app/dashboard/MpgChart.tsx
'use client';

import { Line, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, type ScriptableContext } from 'chart.js';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import type { MpgSegment } from '@/lib/tracker/fuelLog';
import { formatDistance, formatFuelEconomy, type FuelEconomyUnit, type DistanceUnit } from '@/lib/tracker/unitFormat';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { useChartTypePreference } from './useChartTypePreference';
import { ChartTypeToggle } from './ChartTypeToggle';
import { barGradient, BAR_BORDER_RADIUS, lineAreaGradient, lastPointRadius, lastPointRing, lastPointRingWidth, dashedValueAxis, plainCategoryAxis } from './chartStyle';
import { useChartFilter } from './ChartFilterContext';
import { useTabSwitch, viewRecords } from './TabSwitchContext';
import styles from './dashboard.module.css';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend);

const CHART_ID = 'mpg';
const LITRES_PER_UK_GALLON = 4.546;
const KM_PER_MILE = 1.60934;
const EXCLUDED_COLOR = '#C1483A'; // matches --verdict-red / --red
const MPG_COLOR = '#EE9A2E'; // matches --amber

function convertMpgValue(mpg: number, unit: FuelEconomyUnit): number {
  if (unit === 'l100km') {
    return (LITRES_PER_UK_GALLON * 100) / (mpg * KM_PER_MILE);
  }
  return mpg;
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A line SEGMENT is the piece between two adjacent points - flagging it
// whenever EITHER endpoint is excluded means the dashed styling below
// covers the approach into an excluded point and the way back out of it,
// not just the point itself, which is what actually reads as "a broken
// stretch" rather than two unrelated solid lines that happen to meet at
// a red dot.
function isSegmentFlagged(filtered: MpgSegment[], ctx: { p0DataIndex: number; p1DataIndex: number }): boolean {
  return Boolean(filtered[ctx.p0DataIndex]?.likelyMissedFillUps || filtered[ctx.p1DataIndex]?.likelyMissedFillUps);
}

function exclusionReasonText(point: MpgSegment | undefined): string | null {
  if (!point?.likelyMissedFillUps) return null;
  if (point.exclusionReason === 'marked-anomaly') {
    return "Marked as a known anomaly - kept in your records exactly as logged, just excluded from the average and trend line so it doesn't distort them.";
  }
  if (point.exclusionReason === 'unusual-gap') {
    return 'Excluded - the gap since the last fill-up is much bigger than usual, so a fill-up in between was probably missed.';
  }
  if (point.exclusionReason === 'anomalous-vs-lifetime') {
    return "Excluded - this reading is far outside your longer-term average, so a fill-up in between was probably missed. There isn't quite enough recent history yet to judge it against your most recent riding alone.";
  }
  return 'Excluded - this reading is far outside your usual range, so a fill-up in between was probably missed.';
}

export function MpgChart({
  series,
  fuelEconomyUnit,
  distanceUnit,
  initialChartType,
  currency,
  rates,
  excludedFuelEntries,
}: {
  series: MpgSegment[];
  fuelEconomyUnit: FuelEconomyUnit;
  distanceUnit: DistanceUnit;
  initialChartType?: 'line' | 'bar';
  currency: Currency;
  rates: ExchangeRates | null;
  excludedFuelEntries: { date: string; cost: number }[];
}) {
  const { switchTo, setHighlightIds } = useTabSwitch();
  const { range, viewBy } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(CHART_ID, initialChartType ?? 'line');
  const dateFiltered = filterByDateRange(series, range);
  const missedFillUpCount = dateFiltered.filter((s) => s.likelyMissedFillUps && s.exclusionReason !== 'marked-anomaly').length;
  const markedAnomalyCount = dateFiltered.filter((s) => s.exclusionReason === 'marked-anomaly').length;
  // Same range the chart itself is currently showing, applied to the
  // excluded entries too - so the note below always reflects "how much
  // of what you're looking at right now was left out", not a lifetime
  // total that wouldn't match the chart on screen.
  const excludedInRange = filterByDateRange(excludedFuelEntries, range);
  const excludedSpend = excludedInRange.reduce((sum, e) => sum + e.cost, 0);
  // Kept together, not split apart - an excluded point still needs to
  // sit in its correct chronological/mileage position on the x-axis,
  // shown differently rather than removed, so the reader can see WHERE
  // the gap or anomaly actually falls, not just that something's missing.
  const filtered =
    viewBy === 'time' ? [...dateFiltered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()) : dateFiltered;
  const yLabel = fuelEconomyUnit === 'l100km' ? 'L/100km' : 'mpg';
  // Same trusted-only philosophy as computeActualMPG - a flagged reading
  // shouldn't get to drag the number shown in the title, matching the
  // fact that it's already excluded from the line itself.
  const trustedInView = dateFiltered.filter((s) => !s.likelyMissedFillUps);
  const rangeAverageMpg =
    trustedInView.length > 0 ? trustedInView.reduce((sum, s) => sum + s.mpg, 0) / trustedInView.length : null;
  const title = `${fuelEconomyUnit === 'l100km' ? 'Fuel economy' : 'MPG'} over time${
    rangeAverageMpg !== null ? ` - ${formatFuelEconomy(rangeAverageMpg, fuelEconomyUnit)} average` : ''
  }`;

  const labels = viewBy === 'time' ? filtered.map((s) => fmtDate(s.date)) : filtered.map((s) => formatDistance(s.mileage, distanceUnit));
  const allValues = filtered.map((s) => Number(convertMpgValue(s.mpg, fuelEconomyUnit).toFixed(1)));
  const excludedValues = filtered.map((s, i) => (s.likelyMissedFillUps ? allValues[i] : null));

  function handlePointClick(elements: { index: number }[]) {
    if (elements.length === 0) return;
    const point = filtered[elements[0].index];
    if (point?.fuelLogId) viewRecords('fuel', [point.fuelLogId], switchTo, setHighlightIds);
  }

  function handleHover(event: { native: Event | null }, elements: unknown[]) {
    const target = event.native?.target as HTMLElement | undefined;
    if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  }

  function tooltipLabel(dataIndex: number, yValue: number | null): string | string[] {
    const point = filtered[dataIndex];
    const value = `${yValue ?? '-'} ${yLabel}`;
    const reason = exclusionReasonText(point);
    return reason ? [value, reason] : value;
  }

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['line', 'bar']} />
      </div>
      {filtered.length === 0 ? (
        <p className={styles.emptyNote}>No fill-ups logged in this time range.</p>
      ) : kind === 'bar' ? (
        <Bar
          data={{
            labels,
            datasets: [
              {
                label: fuelEconomyUnit === 'l100km' ? 'L/100km' : 'MPG',
                data: allValues,
                backgroundColor: (context: ScriptableContext<'bar'>) =>
                  filtered[context.dataIndex]?.likelyMissedFillUps ? EXCLUDED_COLOR : barGradient(MPG_COLOR)(context),
                borderRadius: BAR_BORDER_RADIUS,
              },
            ],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => tooltipLabel(ctx.dataIndex, ctx.parsed.y) } },
            },
            scales: {
              y: dashedValueAxis({ title: { display: true, text: yLabel } }),
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
                label: fuelEconomyUnit === 'l100km' ? 'L/100km' : 'MPG',
                data: allValues,
                borderColor: MPG_COLOR,
                backgroundColor: lineAreaGradient(MPG_COLOR),
                borderWidth: 2.4,
                borderCapStyle: 'round',
                borderJoinStyle: 'round',
                tension: 0.25,
                fill: true,
                // Every real point gets a small dot; only the most recent
                // one renders larger with a white ring, so the chart reads
                // as "you are here" rather than a static trend. This is
                // layered on TOP of the existing exclusion colouring below
                // (pointBackgroundColor is untouched) - the ring is the
                // point's border, not its fill, so the two never conflict.
                pointRadius: lastPointRadius(2, 5),
                pointBorderColor: lastPointRing(MPG_COLOR),
                pointBorderWidth: lastPointRingWidth(0, 2),
                pointBackgroundColor: (ctx: ScriptableContext<'line'>) =>
                  filtered[ctx.dataIndex]?.likelyMissedFillUps ? EXCLUDED_COLOR : MPG_COLOR,
                // One continuous line across the whole range now, rather
                // than two separate series with a bare gap between them -
                // the segment styling below is what shows an excluded
                // stretch differently, without ever breaking the path
                // itself.
                segment: {
                  borderColor: (ctx) => (isSegmentFlagged(filtered, ctx) ? EXCLUDED_COLOR : undefined),
                  borderDash: (ctx) => (isSegmentFlagged(filtered, ctx) ? [6, 4] : undefined),
                },
              },
              {
                label: 'Excluded',
                data: excludedValues,
                showLine: false,
                pointRadius: 4,
                pointBackgroundColor: EXCLUDED_COLOR,
                pointBorderColor: EXCLUDED_COLOR,
              },
            ],
          }}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => tooltipLabel(ctx.dataIndex, ctx.parsed.y) } },
            },
            scales: {
              y: dashedValueAxis({ title: { display: true, text: yLabel } }),
              x: plainCategoryAxis(),
            },
            onClick: (_evt, elements) => handlePointClick(elements),
            onHover: handleHover,
            maintainAspectRatio: true,
          }}
        />
      )}
      {excludedSpend > 0 && (
        <p className={styles.mpgExcludedNote}>
          {formatCurrency(excludedSpend, currency, rates)} of fuel spend excluded from this calculation because the
          mileage on those entries hasn&apos;t been verified yet - edit them to confirm the mileage and they&apos;ll
          count from then on.
        </p>
      )}
      {missedFillUpCount > 0 && (
        <p className={styles.mpgExcludedNote}>
          {missedFillUpCount} {missedFillUpCount === 1 ? 'reading looks' : 'readings look'} far enough outside your
          usual range that a fill-up in between probably wasn&apos;t logged (shown in red above) - hover one for why
          it&apos;s left out of the average.
        </p>
      )}
      {markedAnomalyCount > 0 && (
        <p className={styles.mpgExcludedNote}>
          {markedAnomalyCount} {markedAnomalyCount === 1 ? 'reading is' : 'readings are'} marked as a known anomaly
          (shown in red above) - kept exactly as logged, just excluded from the average and trend line.
        </p>
      )}
    </div>
  );
}
