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
}) {
  const { switchTo, setHighlightIds } = useTabSwitch();
  const { range, viewBy } = useChartFilter();
  const { kind, changeKind } = useChartTypePreference(chartId, initialChartType ?? 'bar');
  const symbol = CURRENCY_SYMBOLS[currency];
  const usingMileageView = supportsMileageView && viewBy === 'mileage';

  const filteredItems = filterByDateRange(items, range);

  let labels: string[];
  let dataValues: number[];
  let bucketIds: string[][];

  if (usingMileageView) {
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

  // A bucket here can be several records summed together, so a click
  // switches tabs and highlights every one of them (scrolling to the
  // first) rather than pretending there's a single record to jump to.
  function handleBarClick(elements: { index: number }[]) {
    if (elements.length === 0) return;
    const ids = bucketIds[elements[0].index];
    if (ids?.length) viewRecords(category, ids, switchTo, setHighlightIds);
  }

  function handleHover(event: { native: Event | null }, elements: unknown[]) {
    const target = event.native?.target as HTMLElement | undefined;
    if (target) target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
  }

  return (
    <div>
      <div className={styles.chartCardHeader}>
        <span className={styles.chartCardTitle}>{title}</span>
        <ChartTypeToggle value={kind} onChange={changeKind} options={['bar', 'line']} />
      </div>
      {!supportsMileageView && viewBy === 'mileage' && (
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
                pointRadius: lastPointRadius(2, 5),
                pointBorderColor: lastPointRing(color),
                pointBorderWidth: lastPointRingWidth(0, 2),
                pointBackgroundColor: color,
              },
            ],
          }}
          options={{
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } },
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
            datasets: [{ data: dataValues, backgroundColor: barGradient(color), borderRadius: BAR_BORDER_RADIUS }],
          }}
          options={{
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (ctx) => `${symbol}${Math.round(ctx.parsed.y as number)}` } },
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
    </div>
  );
}
