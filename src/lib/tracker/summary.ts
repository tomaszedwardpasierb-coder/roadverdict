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

// id/category are optional so every OTHER existing caller of this type
// (the scan-receipt route builds plain {date, mileage} points for its own
// mileage-estimation input, with no record to link back to) keeps
// compiling unchanged - only gatherMileagePoints itself, used for the
// dashboard chart, populates them.
export interface MileagePoint {
  date: string;
  mileage: number;
  id?: string;
  category?: "service" | "fuel" | "mods";
}

export function gatherMileagePoints(
  records: ServiceRecordDoc[],
  mods: ModDoc[],
  fuelLogs: FuelLogDoc[]
): MileagePoint[] {
  const points: MileagePoint[] = [
    ...records.map((r) => ({ date: r.date, mileage: r.mileage, id: r.id, category: "service" as const })),
    ...mods.map((m) => ({ date: m.date, mileage: m.mileage, id: m.id, category: "mods" as const })),
    ...fuelLogs.map((f) => ({ date: f.date, mileage: f.mileage, id: f.id, category: "fuel" as const })),
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
  // Every record id that contributed to this bucket - a bar here can be
  // several records summed together, so clicking it can only reliably
  // offer "these entries", not a single one.
  ids: string[];
}

// Generic single-category monthly bucketing - used by each tab's own
// spend-over-time chart (Service, Mods, Bills), rather than one combined
// chart that mixes categories together meaninglessly.
export function bucketByMonth(items: { id: string; date: string; cost: number }[]): MonthlyTotal[] {
  const totals = new Map<string, number>();
  const ids = new Map<string, string[]>();
  items.forEach((i) => {
    const key = monthKey(i.date);
    totals.set(key, (totals.get(key) ?? 0) + i.cost);
    ids.set(key, [...(ids.get(key) ?? []), i.id]);
  });
  const sortedKeys = [...totals.keys()].sort();
  return sortedKeys.map((k) => ({ month: monthLabel(k), total: totals.get(k) as number, ids: ids.get(k) as string[] }));
}

export interface MileageBandTotal {
  bandStart: number;
  bandEnd: number;
  total: number;
  ids: string[];
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
export function bucketByMileage(items: { id: string; mileage: number; cost: number }[]): MileageBandTotal[] {
  if (items.length === 0) return [];
  const mileages = items.map((i) => i.mileage);
  const bandSize = chooseMileageBandSize(Math.min(...mileages), Math.max(...mileages));
  const totals = new Map<number, number>();
  const ids = new Map<number, string[]>();
  items.forEach((i) => {
    const bandStart = Math.floor(i.mileage / bandSize) * bandSize;
    totals.set(bandStart, (totals.get(bandStart) ?? 0) + i.cost);
    ids.set(bandStart, [...(ids.get(bandStart) ?? []), i.id]);
  });
  const sortedStarts = [...totals.keys()].sort((a, b) => a - b);
  return sortedStarts.map((start) => ({
    bandStart: start,
    bandEnd: start + bandSize,
    total: totals.get(start) as number,
    ids: ids.get(start) as string[],
  }));
}
