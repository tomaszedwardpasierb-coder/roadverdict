// Place at: src/app/dashboard/DashboardStatCards.tsx
'use client';

import { useChartFilter } from './ChartFilterContext';
import { filterByDateRange } from '@/lib/tracker/dateRange';
import { computeMPGSeries, type MpgCalcInput } from '@/lib/tracker/mpgCalc';
import { formatCurrency, type Currency, type ExchangeRates } from '@/lib/tracker/currency';
import { formatFuelEconomy, formatCostPerDistance, type DistanceUnit, type FuelEconomyUnit } from '@/lib/tracker/unitFormat';
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
  fuelLogs: (MpgCalcInput & { cost: number })[];
  currentMileage: number;
  startingMileage: number;
  currency: Currency;
  rates: ExchangeRates | null;
  distanceUnit: DistanceUnit;
  fuelEconomyUnit: FuelEconomyUnit;
}

export function DashboardStatCards({
  records,
  mods,
  bills,
  fuelLogs,
  currentMileage,
  startingMileage,
  currency,
  rates,
  distanceUnit,
  fuelEconomyUnit,
}: Props) {
  const { range } = useChartFilter();

  const filteredRecords = filterByDateRange(records, range);
  const filteredMods = filterByDateRange(mods, range);
  const filteredBills = filterByDateRange(bills, range);
  const filteredFuel = filterByDateRange(fuelLogs, range);
  const totalSpend = [...filteredRecords, ...filteredMods, ...filteredBills, ...filteredFuel].reduce((sum, r) => sum + r.cost, 0);

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
    ...filteredFuel.map((r) => r.mileage),
  ];
  if (range === 'all') {
    mileagePoints.push(startingMileage, currentMileage);
  }
  const milesInRange = mileagePoints.length >= 2 ? Math.max(...mileagePoints) - Math.min(...mileagePoints) : 0;
  const costPerMile = milesInRange > 0 ? (totalSpend / milesInRange) * 100 : null;

  return (
    <>
      <div className={styles.statCard}>
        <div className={styles.statCardValue}>{formatCurrency(totalSpend, currency, rates)}</div>
        <div className={styles.statCardLabel}>Total spend</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statCardValue}>{actualMpg ? formatFuelEconomy(actualMpg, fuelEconomyUnit) : '-'}</div>
        <div className={styles.statCardLabel}>Actual economy</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statCardValue}>{costPerMile != null ? formatCostPerDistance(costPerMile, distanceUnit) : '-'}</div>
        <div className={styles.statCardLabel}>Per {distanceUnit === 'km' ? 'km' : 'mile'}</div>
      </div>
    </>
  );
}
