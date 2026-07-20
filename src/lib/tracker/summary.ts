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

export interface MonthlySpend {
  month: string;
  servicing: number;
  mods: number;
  fuel: number;
  bills: number;
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

export function computeMonthlySpend(
  records: ServiceRecordDoc[],
  mods: ModDoc[],
  fuelLogs: FuelLogDoc[],
  bills: BillDoc[]
): MonthlySpend[] {
  const buckets = new Map<string, MonthlySpend>();
  function add(dateStr: string, cost: number, field: "servicing" | "mods" | "fuel" | "bills") {
    const key = monthKey(dateStr);
    if (!buckets.has(key)) {
      buckets.set(key, { month: monthLabel(key), servicing: 0, mods: 0, fuel: 0, bills: 0 });
    }
    buckets.get(key)![field] += cost;
  }
  records.forEach((r) => add(r.date, r.cost, "servicing"));
  mods.forEach((m) => add(m.date, m.cost, "mods"));
  fuelLogs.forEach((f) => add(f.date, f.cost, "fuel"));
  bills.forEach((b) => add(b.date, b.cost, "bills"));

  const sortedKeys = [...buckets.keys()].sort();
  return sortedKeys.map((k) => buckets.get(k) as MonthlySpend);
}
