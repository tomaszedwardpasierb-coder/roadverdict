// Place at: src/lib/tracker/summary.ts
import type { ServiceRecordDoc } from "./serviceRecord";
import type { ModDoc } from "./mod";
import type { FuelLogDoc } from "./fuelLog";
import type { BillDoc } from "./bill";

export interface SpendSummary {
  servicingTotal: number;
  modsTotal: number;
  fuelTotal: number;
  billsTotal: number;
  grandTotal: number;
}

export function computeSpendSummary(
  records: ServiceRecordDoc[],
  mods: ModDoc[],
  fuelLogs: FuelLogDoc[],
  bills: BillDoc[]
): SpendSummary {
  const servicingTotal = records.reduce((sum, r) => sum + r.cost, 0);
  const modsTotal = mods.reduce((sum, m) => sum + m.cost, 0);
  const fuelTotal = fuelLogs.reduce((sum, f) => sum + f.cost, 0);
  const billsTotal = bills.reduce((sum, b) => sum + b.cost, 0);
  return {
    servicingTotal,
    modsTotal,
    fuelTotal,
    billsTotal,
    grandTotal: servicingTotal + modsTotal + fuelTotal + billsTotal,
  };
}

export function computeYearSpend(
  records: ServiceRecordDoc[],
  mods: ModDoc[],
  fuelLogs: FuelLogDoc[],
  bills: BillDoc[],
  year: number
): number {
  const inYear = (d: string) => new Date(d).getFullYear() === year;
  const sum = (arr: { date: string; cost: number }[]) => arr.filter((x) => inYear(x.date)).reduce((s, x) => s + x.cost, 0);
  return sum(records) + sum(mods) + sum(fuelLogs) + sum(bills);
}

export interface MileagePoint {
  date: string;
  mileage: number;
}

export function gatherMileagePoints(
  records: ServiceRecordDoc[],
  mods: ModDoc[],
  fuelLogs: FuelLogDoc[]
): MileagePoint[] {
  const points: MileagePoint[] = [
    ...records.map((r) => ({ date: r.date, mileage: r.mileage })),
    ...mods.map((m) => ({ date: m.date, mileage: m.mileage })),
    ...fuelLogs.map((f) => ({ date: f.date, mileage: f.mileage })),
  ];
  return points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export interface MonthlyTotal {
  month: string;
  total: number;
}

// Generic single-category monthly bucketing - used by each tab's own
// spend-over-time chart (Service, Mods, Bills), rather than one combined
// chart that mixes categories together meaninglessly.
export function bucketByMonth(items: { date: string; cost: number }[]): MonthlyTotal[] {
  const buckets = new Map<string, number>();
  items.forEach((i) => {
    const key = monthKey(i.date);
    buckets.set(key, (buckets.get(key) ?? 0) + i.cost);
  });
  const sortedKeys = [...buckets.keys()].sort();
  return sortedKeys.map((k) => ({ month: monthLabel(k), total: buckets.get(k) as number }));
}

export interface MileageBandTotal {
  bandStart: number;
  bandEnd: number;
  total: number;
}

// Aims for roughly 6-8 bands, choosing a round band size (500/1,000/2,500
// miles etc.) rather than a fixed band width - a bike with 3,000 miles
// logged and one with 60,000 miles logged both get a sensible number of
// bars, instead of either 3 bars or 60.
const NICE_BAND_SIZES = [250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];

function chooseMileageBandSize(minMileage: number, maxMileage: number): number {
  const span = Math.max(maxMileage - minMileage, 1);
  const rough = span / 7;
  return NICE_BAND_SIZES.find((n) => n >= rough) ?? NICE_BAND_SIZES[NICE_BAND_SIZES.length - 1];
}

// Mileage-band bucketing, the mileage-axis equivalent of bucketByMonth.
// Bands are computed in miles (mileage is always stored in miles
// internally) - converting a band's start/end to the display unit is left
// to the chart component at render time, same as every other chart here
// already converts miles->km only when actually labelling an axis.
export function bucketByMileage(items: { mileage: number; cost: number }[]): MileageBandTotal[] {
  if (items.length === 0) return [];
  const mileages = items.map((i) => i.mileage);
  const bandSize = chooseMileageBandSize(Math.min(...mileages), Math.max(...mileages));
  const buckets = new Map<number, number>();
  items.forEach((i) => {
    const bandStart = Math.floor(i.mileage / bandSize) * bandSize;
    buckets.set(bandStart, (buckets.get(bandStart) ?? 0) + i.cost);
  });
  const sortedStarts = [...buckets.keys()].sort((a, b) => a - b);
  return sortedStarts.map((start) => ({ bandStart: start, bandEnd: start + bandSize, total: buckets.get(start) as number }));
}
