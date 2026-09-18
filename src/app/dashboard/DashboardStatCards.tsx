// Place at: src/app/dashboard/DashboardStatCards.tsx
'use client';

import { useChartFilter } from './ChartFilterContext';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { computeMPGSeries, type MpgCalcInput } from '@/lib/tracker/mpgCalc';
import { formatCurrency, convertGbpToDisplay, CURRENCY_SYMBOLS, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatFuelEconomy, formatCostPerDistance, convertMilesToDisplay, KM_PER_MILE, type DistanceUnit, type FuelEconomyUnit } from '@/lib/tracker/unitFormat';
import type { YearEndProjection } from '@/lib/tracker/summary';
import type { ForecastWindow, ForecastMonthPoint } from '@/lib/tracker/costForecast';
import { Icon } from './Icon';
import { LockedStatCard } from './LockedStatCard';
import styles from './dashboard.module.css';

interface CostItem {
  date: string;
  cost: number;
  mileage?: number;
}

interface Props {
  records: CostItem[];
  mods: CostItem[];
  bills: CostItem[];
  labour: CostItem[];
  fuelLogs: (MpgCalcInput & { cost: number })[];
  currentMileage: number;
  startingMileage: number;
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  fuelEconomyUnit: FuelEconomyUnit;
  // Total spend and Current miles stay free (the "yes, this actually
  // works" proof) - only the two more analytical stats here (Actual
  // economy, Per mile) plus Spend this year are Premium-gated.
  isPro?: boolean;
  // Powers the "Spend this year" card's own forecast swap - a year-end
  // projection, not tied to forecastWindow below (see its own comment).
  currentYear: number;
  yearSpend: number;
  yearEndProjection: YearEndProjection | null;
  // Precomputed server-side for every window at once, same "page.tsx
  // can't read client state at render time" reason CategorySpendChart's
  // own `forecast` prop exists for - see costForecast.ts's
  // totalForecastSpend and projectMileageOverWindow. Both undefined for a
  // caller that hasn't wired forecasting up (there is none left, but
  // keeping these optional avoids a hard crash if that ever changes).
  spendForecastByWindow?: Record<ForecastWindow, number>;
  // Mileage-over-time points, same shape MileageChart's own `forecast`
  // prop takes - this card only cares about the LAST one (mileage at the
  // end of the window), not the trend in between.
  mileageForecastByWindow?: Record<ForecastWindow, ForecastMonthPoint[]>;
}

export function DashboardStatCards({
  records,
  mods,
  bills,
  labour,
  fuelLogs,
  currentMileage,
  startingMileage,
  currency,
  rates,
  distanceUnit,
  fuelEconomyUnit,
  isPro = false,
  currentYear,
  yearSpend,
  yearEndProjection,
  spendForecastByWindow,
  mileageForecastByWindow,
}: Props) {
  const { range, forecastMode, forecastWindow } = useChartFilter();

  const filteredRecords = filterByDateRange(records, range);
  const filteredMods = filterByDateRange(mods, range);
  const filteredBills = filterByDateRange(bills, range);
  const filteredLabour = filterByDateRange(labour, range);
  const filteredFuel = filterByDateRange(fuelLogs, range);
  const totalSpend = [...filteredRecords, ...filteredMods, ...filteredBills, ...filteredLabour, ...filteredFuel].reduce((sum, r) => sum + r.cost, 0);

  // Segments are computed on the FULL, unfiltered fuel log first, so a
  // fill-up right at the edge of the range still has its preceding
  // full-tank fill-up available to measure against - only the resulting
  // segments get date-filtered afterward. Same approach the MPG chart
  // itself already uses; filtering the raw logs before computing segments
  // would silently break the mileage-consecutive relationship a segment
  // depends on.
  const allSegments = computeMPGSeries(fuelLogs);
  const segmentsInRange = filterByDateRange(allSegments, range);
  const actualMpg = segmentsInRange.length > 0 ? segmentsInRange.reduce((sum, s) => sum + s.mpg, 0) / segmentsInRange.length : null;

  // Miles covered in the selected range. For "all", the bike's own
  // lifetime bookends (startingMileage/currentMileage) are seeded in so
  // this exactly matches currentMileage - startingMileage, same as before
  // this feature existed - not an approximation for that specific case.
  // For any other range, only the real mileage-bearing entries that
  // actually fall within the window are used (Bills have no mileage, so
  // they're never part of this).
  const mileagePoints: number[] = [
    ...filteredRecords.map((r) => r.mileage).filter((m): m is number => m != null),
    ...filteredMods.map((r) => r.mileage).filter((m): m is number => m != null),
    ...filteredLabour.map((r) => r.mileage).filter((m): m is number => m != null),
    ...filteredFuel.map((r) => r.mileage),
  ];
  if (range === 'all') {
    mileagePoints.push(startingMileage, currentMileage);
  }
  const milesInRange = mileagePoints.length >= 2 ? Math.max(...mileagePoints) - Math.min(...mileagePoints) : 0;
  // In the bike's own selected display currency, not raw GBP - matches
  // the "Total spend" card above, which already converts. Previously
  // this stayed in GBP pence regardless of currency, so a EUR/PLN/etc.
  // bike showed its per-mile figure mislabeled as GBP pence.
  const displayTotalSpend = convertGbpToDisplay(totalSpend, currency, rates);
  const costPerMileDisplay = milesInRange > 0 ? displayTotalSpend / milesInRange : null;

  // Forecast-mode figures - only "on" once there's genuinely a
  // precomputed number for the currently selected window; otherwise
  // every card below quietly falls back to its normal real-data value,
  // same as CategorySpendChart's own `showingForecast` guard.
  const projectedSpend = spendForecastByWindow?.[forecastWindow];
  const mileageForecastPoints = mileageForecastByWindow?.[forecastWindow];
  const projectedMileage = mileageForecastPoints?.[mileageForecastPoints.length - 1]?.total;
  const showingForecast = forecastMode && projectedSpend != null && projectedMileage != null;
  const extraMilesForecast = showingForecast ? Math.max(0, projectedMileage! - currentMileage) : 0;
  const displayProjectedSpend = showingForecast ? convertGbpToDisplay(projectedSpend!, currency, rates) : null;
  const costPerMileForecastDisplay = showingForecast && extraMilesForecast > 0 ? displayProjectedSpend! / extraMilesForecast : null;

  // "Spend this year" is a to-year-end concept, unrelated to the
  // 1w/1m/6m/1y window the other cards key off - it switches to a
  // projection whenever Forecast mode is on AND there's actually one to
  // show (see summary.ts's projectYearEndSpend on why there sometimes
  // isn't, e.g. too early in January), regardless of forecastWindow.
  const showingYearProjection = forecastMode && yearEndProjection != null;

  const distanceLabel = distanceUnit === 'km' ? 'km' : 'miles';
  const distanceLabelShort = distanceUnit === 'km' ? 'km' : 'mile';

  return (
    <>
      <div className={styles.statCard}>
        <div className={`${styles.statCardIcon} ${showingForecast ? styles.statCardIconForecast : styles.statCardIconNeutral}`}>
          <Icon name="totalSpend" size={16} />
        </div>
        <div className={`${styles.statCardValue} ${showingForecast ? styles.statCardValueForecast : ''}`}>
          {formatCurrency(showingForecast ? projectedSpend! : totalSpend, currency, rates)}
        </div>
        <div className={styles.statCardLabel}>{showingForecast ? 'Projected spend' : 'Total spend'}</div>
      </div>
      {isPro ? (
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${styles.statCardIconGreen}`}>
            <Icon name="economy" size={16} />
          </div>
          <div className={styles.statCardValue}>{actualMpg ? formatFuelEconomy(actualMpg, fuelEconomyUnit) : '-'}</div>
          <div className={styles.statCardLabel}>Actual economy</div>
        </div>
      ) : (
        <LockedStatCard icon="economy" iconClass={styles.statCardIconGreen} label="Actual economy" />
      )}
      {isPro ? (
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${showingForecast ? styles.statCardIconForecast : styles.statCardIconAmber}`}>
            <Icon name="perMile" size={16} />
          </div>
          <div className={`${styles.statCardValue} ${showingForecast ? styles.statCardValueForecast : ''}`}>
            {showingForecast
              ? costPerMileForecastDisplay == null
                ? '-'
                : currency === 'GBP'
                  ? formatCostPerDistance(costPerMileForecastDisplay * 100, distanceUnit)
                  : `${CURRENCY_SYMBOLS[currency]}${(distanceUnit === 'km' ? costPerMileForecastDisplay / KM_PER_MILE : costPerMileForecastDisplay).toFixed(2)}`
              : costPerMileDisplay == null
                ? '-'
                : currency === 'GBP'
                  ? formatCostPerDistance(costPerMileDisplay * 100, distanceUnit)
                  : `${CURRENCY_SYMBOLS[currency]}${(distanceUnit === 'km' ? costPerMileDisplay / KM_PER_MILE : costPerMileDisplay).toFixed(2)}`}
          </div>
          <div className={styles.statCardLabel}>{showingForecast ? `Projected per ${distanceLabelShort}` : `Per ${distanceLabelShort}`}</div>
        </div>
      ) : (
        <LockedStatCard icon="perMile" iconClass={styles.statCardIconAmber} label={`Per ${distanceLabelShort}`} />
      )}
      <div className={styles.statCard}>
        <div className={`${styles.statCardIcon} ${showingForecast ? styles.statCardIconForecast : styles.statCardIconNeutral}`}>
          <Icon name="currentMiles" size={16} />
        </div>
        <div className={`${styles.statCardValue} ${showingForecast ? styles.statCardValueForecast : ''}`}>
          {Math.round(convertMilesToDisplay(showingForecast ? projectedMileage! : currentMileage, distanceUnit)).toLocaleString()}
        </div>
        <div className={styles.statCardLabel}>{showingForecast ? `Projected ${distanceLabel}` : `Current ${distanceLabel}`}</div>
      </div>
      {isPro ? (
        <div className={styles.statCard}>
          <div className={`${styles.statCardIcon} ${showingYearProjection ? styles.statCardIconForecast : styles.statCardIconNeutral}`}>
            <Icon name="spendThisYear" size={16} />
          </div>
          <div className={`${styles.statCardValue} ${showingYearProjection ? styles.statCardValueForecast : ''}`}>
            {formatCurrency(showingYearProjection ? yearEndProjection!.projected : yearSpend, currency, rates)}
          </div>
          <div className={styles.statCardLabel}>{showingYearProjection ? `Projected for ${currentYear}` : 'Spend this year'}</div>
        </div>
      ) : (
        <LockedStatCard icon="spendThisYear" iconClass={styles.statCardIconNeutral} label="Spend this year" />
      )}
    </>
  );
}
