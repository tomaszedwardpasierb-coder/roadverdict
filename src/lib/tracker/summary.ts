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
