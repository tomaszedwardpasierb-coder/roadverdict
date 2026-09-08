// Place at: src/lib/tracker/carSummary.ts
//
// Car equivalent of summary.ts's three per-vehicle aggregation functions.
// summary.ts's own implementations only ever touch `.date`/`.mileage`/
// `.cost`/`.id`/`.billType` - genuinely generic at runtime - but their
// TYPE signatures are pinned to ServiceRecordDoc/ModDoc/FuelLogDoc/
// BillDoc, so a CarServiceRecordDoc etc. (structurally identical on
// every field these touch, but a different `type` literal) doesn't
// type-check against them. Small enough to mirror directly rather than
// loosen summary.ts's own signatures - same sister-schema discipline as
// everywhere else in this build. bucketByMonth/bucketByMileage in
// summary.ts are already plain-shape generic and need no car twin.
import type { CarServiceRecordDoc } from "./carServiceRecord";
import type { CarModDoc } from "./carMod";
import type { CarFuelLogDoc } from "./carFuelLog";
import type { CarBillDoc } from "./carBill";
import type { CarLabourDoc } from "./carLabour";
import type { SpendSummary, MileagePoint } from "./summary";

export function computeCarSpendSummary(
  records: CarServiceRecordDoc[],
  mods: CarModDoc[],
  fuelLogs: CarFuelLogDoc[],
  bills: CarBillDoc[],
  labour: CarLabourDoc[] = []
): SpendSummary {
  const servicingTotal = records.reduce((sum, r) => sum + r.cost, 0);
  const modsTotal = mods.reduce((sum, m) => sum + m.cost, 0);
  const fuelTotal = fuelLogs.reduce((sum, f) => sum + f.cost, 0);
  const billsTotal = bills.reduce((sum, b) => sum + b.cost, 0);
  const labourTotal = labour.reduce((sum, l) => sum + l.cost, 0);
  return {
    servicingTotal,
    modsTotal,
    fuelTotal,
    billsTotal,
    labourTotal,
    grandTotal: servicingTotal + modsTotal + fuelTotal + billsTotal + labourTotal,
  };
}

export function computeCarYearSpend(
  records: CarServiceRecordDoc[],
  mods: CarModDoc[],
  fuelLogs: CarFuelLogDoc[],
  bills: CarBillDoc[],
  year: number,
  labour: CarLabourDoc[] = []
): number {
  const inYear = (d: string) => new Date(d).getFullYear() === year;
  const sum = (arr: { date: string; cost: number }[]) => arr.filter((x) => inYear(x.date)).reduce((s, x) => s + x.cost, 0);
  return sum(records) + sum(mods) + sum(fuelLogs) + sum(bills) + sum(labour);
}

export function gatherCarMileagePoints(
  records: CarServiceRecordDoc[],
  mods: CarModDoc[],
  fuelLogs: CarFuelLogDoc[],
  bills: CarBillDoc[] = [],
  labour: CarLabourDoc[] = []
): MileagePoint[] {
  const points: MileagePoint[] = [
    ...records.map((r) => ({ date: r.date, mileage: r.mileage, id: r.id, category: "service" as const })),
    ...mods.map((m) => ({ date: m.date, mileage: m.mileage, id: m.id, category: "mods" as const })),
    ...fuelLogs.map((f) => ({ date: f.date, mileage: f.mileage, id: f.id, category: "fuel" as const })),
    ...bills
      .filter((b) => b.billType === "mot-test" && b.mileage != null)
      .map((b) => ({ date: b.date, mileage: b.mileage as number, id: b.id, category: "mot" as const })),
    ...labour.map((l) => ({ date: l.date, mileage: l.mileage, id: l.id, category: "labour" as const })),
  ];
  return points.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
