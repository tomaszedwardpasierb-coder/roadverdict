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

// Spend within the current calendar year only - what "this year's budget"
// naturally means. Resets automatically each January.
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

// Every logged event that carries a mileage reading, across all
// categories, sorted chronologically. Bills don't carry mileage, so
// they're excluded here.
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
