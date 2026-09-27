// Place at: src/lib/app/reportsData.ts
//
// The Android app's Reports: the figures the web dashboard's stat cards
// and charts show (DashboardStatCards, SpendDonutChart, MileageChart,
// MpgChart, FuelCostChart, CategorySpendChart), worked out from the same
// tracker functions over the same date ranges, behind the same Pro gate.
// The web sends raw records to the browser and hides the Pro figures
// there; here a free account's response simply doesn't contain them.
//
// One deliberate difference: a car's electric charging costs count towards
// Total spend and Per mile here. The web's car stat cards are handed only
// the litre-based fill-ups (the ones economy can be worked out from), which
// leaves charging out of those two totals.
import { getBike, isBikeReadOnly } from "@/lib/tracker/bike";
import { getCarById, isCarReadOnly } from "@/lib/tracker/car";
import type { VehicleKind } from "@/lib/tracker/activeVehicle";
import { getServiceRecords } from "@/lib/tracker/serviceRecord";
import { getFuelLogs } from "@/lib/tracker/fuelLog";
import { getMods } from "@/lib/tracker/mod";
import { getBills } from "@/lib/tracker/bill";
import { getLabour } from "@/lib/tracker/labour";
import { getCarServiceRecords } from "@/lib/tracker/carServiceRecord";
import { getCarFuelLogs } from "@/lib/tracker/carFuelLog";
import { getCarMods } from "@/lib/tracker/carMod";
import { getCarBills } from "@/lib/tracker/carBill";
import { getCarLabour } from "@/lib/tracker/carLabour";
import { materializeAllDueForBike } from "@/lib/tracker/billSeries";
import { materializeAllDueForCar } from "@/lib/tracker/carBillSeries";
import { computeYearSpend, gatherMileagePoints } from "@/lib/tracker/summary";
import { computeCarYearSpend, gatherCarMileagePoints } from "@/lib/tracker/carSummary";
import { computeMPGSeries, type MpgCalcInput } from "@/lib/tracker/mpgCalc";
import { filterByDateRange, type RangeValue } from "@/lib/tracker/dateRange";
import { convertGbpToDisplay, formatCurrency, CURRENCY_SYMBOLS } from "@/lib/tracker/currency";
import { getExchangeRates } from "@/lib/tracker/currencyRates";
import {
  convertMilesToDisplay,
  formatCostPerDistance,
  formatFuelEconomy,
  fuelEconomyInUnit,
  KM_PER_MILE,
  type DistanceUnit,
  type FuelEconomyUnit,
} from "@/lib/tracker/unitFormat";
import { getProStatus } from "@/lib/subscriptions";
import { bikeSummary, carSummary, type GarageVehicle } from "@/lib/app/homeData";

export type SpendCategory = "service" | "mods" | "fuel" | "bills" | "labour";

// The web's spend donut, in its order and words.
export const SPEND_CATEGORIES: { key: SpendCategory; label: string }[] = [
  { key: "service", label: "Servicing & repairs" },
  { key: "mods", label: "Modifications" },
  { key: "fuel", label: "Fuel" },
  { key: "bills", label: "Insurance/tax/MOT/finance" },
  { key: "labour", label: "Labour" },
];

type Point = { date: string; value: number };

export type ReportsData = {
  vehicle: GarageVehicle;
  isPro: boolean;
  range: RangeValue;
  currencySymbol: string;
  distanceUnit: DistanceUnit;
  economyUnit: FuelEconomyUnit;
  electric: boolean;
  stats: {
    totalSpend: string;
    currentMileage: string;
    // null: a Pro figure, and this account isn't Pro.
    economy: string | null;
    perDistance: string | null;
    yearSpend: string | null;
  };
  // Pro: where the money went in the range, biggest first.
  breakdown: { key: SpendCategory; label: string; amount: number; amountLabel: string }[] | null;
  mileage: Point[];
  // Pro: economy per fill-up (in the vehicle's own unit) and cost per
  // fill-up (in its own currency).
  economySeries: Point[] | null;
  fuelCosts: Point[] | null;
  // Pro: spend per calendar month, per category, in the vehicle's currency.
  monthly: { month: string; label: string; values: Record<SpendCategory, number> }[] | null;
};

type CostItem = { id: string; date: string; cost: number; mileage?: number };

type Loaded = {
  summary: GarageVehicle;
  isPro: boolean;
  currentMileage: number;
  startingMileage: number;
  distanceUnit: DistanceUnit;
  economyUnit: FuelEconomyUnit;
  currency: GarageVehicle["units"]["currency"];
  rates: Awaited<ReturnType<typeof getExchangeRates>>;
  items: Record<SpendCategory, CostItem[]>;
  mpgInputs: MpgCalcInput[];
  officialMpg: number | undefined;
  mileagePoints: { date: string; mileage: number }[];
  yearSpend: number;
};

async function load(email: string, kind: VehicleKind, id: string, year: number): Promise<Loaded | null> {
  if (kind === "bike") {
    const bike = await getBike(email, id);
    if (!bike) return null;
    // The same lazy instalment write the web dashboard makes before it
    // reads bills - see dashboard/page.tsx.
    if (!isBikeReadOnly(bike)) await materializeAllDueForBike(email, bike.id);
    const [records, fuelLogs, mods, bills, labour, rates, pro] = await Promise.all([
      getServiceRecords(email, bike.id),
      getFuelLogs(email, bike.id),
      getMods(email, bike.id),
      getBills(email, bike.id),
      getLabour(email, bike.id),
      getExchangeRates(),
      getProStatus(email),
    ]);
    return {
      summary: bikeSummary(bike, rates),
      isPro: pro.isPro,
      currentMileage: bike.currentMileage,
      startingMileage: bike.startingMileage,
      distanceUnit: bike.distanceUnit ?? "mi",
      economyUnit: bike.fuelEconomyUnit ?? "mpg",
      currency: bike.currency ?? "GBP",
      rates,
      items: { service: records, mods, fuel: fuelLogs, bills, labour },
      mpgInputs: fuelLogs,
      officialMpg: bike.dvlaData?.officialCombinedMpg,
      mileagePoints: gatherMileagePoints(records, mods, fuelLogs, bills, labour),
      yearSpend: computeYearSpend(records, mods, fuelLogs, bills, year, labour),
    };
  }

  const car = await getCarById(email, id);
  if (!car) return null;
  if (!isCarReadOnly(car)) await materializeAllDueForCar(email, car.id);
  const [records, fuelLogs, mods, bills, labour, rates, pro] = await Promise.all([
    getCarServiceRecords(email, car.id),
    getCarFuelLogs(email, car.id),
    getCarMods(email, car.id),
    getCarBills(email, car.id),
    getCarLabour(email, car.id),
    getExchangeRates(),
    getProStatus(email),
  ]);
  return {
    summary: carSummary(car, rates),
    isPro: pro.isPro,
    currentMileage: car.currentMileage,
    startingMileage: car.startingMileage,
    distanceUnit: car.distanceUnit ?? "mi",
    economyUnit: car.fuelEconomyUnit ?? "mpg",
    currency: car.currency ?? "GBP",
    rates,
    items: { service: records, mods, fuel: fuelLogs, bills, labour },
    // Economy only exists for fill-ups measured in litres - a charge has
    // none, the same as the web's MPG chart.
    mpgInputs: fuelLogs
      .filter((f): f is typeof f & { litres: number } => f.litres != null)
      .map((f) => ({
        id: f.id,
        mileage: f.mileage,
        litres: f.litres,
        filledToFull: f.filledToFull ?? false,
        date: f.date,
        mileageConfidence: f.mileageConfidence,
        mileageAnomaly: f.mileageAnomaly,
      })),
    officialMpg: car.dvlaData?.officialCombinedMpg,
    mileagePoints: gatherCarMileagePoints(records, mods, fuelLogs, bills, labour),
    yearSpend: computeCarYearSpend(records, mods, fuelLogs, bills, year, labour),
  };
}

const byDate = (a: { date: string }, b: { date: string }) => new Date(a.date).getTime() - new Date(b.date).getTime();

function monthLabel(key: string): string {
  return new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export async function getReports(email: string, kind: VehicleKind, id: string, range: RangeValue, now: Date = new Date()): Promise<ReportsData | null> {
  const v = await load(email, kind, id, now.getFullYear());
  if (!v) return null;
  const { currency, rates, distanceUnit, isPro } = v;
  const toDisplay = (gbp: number) => Math.round(convertGbpToDisplay(gbp, currency, rates) * 100) / 100;

  const inRange = Object.fromEntries(SPEND_CATEGORIES.map(({ key }) => [key, filterByDateRange(v.items[key], range)])) as Record<SpendCategory, CostItem[]>;
  const totalGbp = SPEND_CATEGORIES.reduce((sum, { key }) => sum + inRange[key].reduce((s, i) => s + i.cost, 0), 0);

  // DashboardStatCards' rules: segments worked out over every fill-up
  // (so one at the edge of the range still has the full tank before it),
  // then the segments themselves filtered to the range.
  const segments = filterByDateRange(computeMPGSeries(v.mpgInputs, v.officialMpg), range);
  const averageMpg = segments.length > 0 ? segments.reduce((sum, s) => sum + s.mpg, 0) / segments.length : null;

  // Distance covered in the range, from entries that carry a mileage -
  // for "all", the vehicle's own starting and current mileage too.
  const mileages = (["service", "mods", "labour", "fuel"] as const).flatMap((key) =>
    inRange[key].map((i) => i.mileage).filter((m): m is number => m != null)
  );
  if (range === "all") mileages.push(v.startingMileage, v.currentMileage);
  const milesInRange = mileages.length >= 2 ? Math.max(...mileages) - Math.min(...mileages) : 0;
  const perMileDisplay = milesInRange > 0 ? convertGbpToDisplay(totalGbp, currency, rates) / milesInRange : null;
  const perDistance =
    perMileDisplay == null
      ? "-"
      : currency === "GBP"
        ? formatCostPerDistance(perMileDisplay * 100, distanceUnit)
        : `${CURRENCY_SYMBOLS[currency]}${(distanceUnit === "km" ? perMileDisplay / KM_PER_MILE : perMileDisplay).toFixed(2)}`;

  const monthly = new Map<string, Record<SpendCategory, number>>();
  for (const { key } of SPEND_CATEGORIES) {
    for (const item of inRange[key]) {
      const month = item.date.slice(0, 7);
      const row = monthly.get(month) ?? { service: 0, mods: 0, fuel: 0, bills: 0, labour: 0 };
      row[key] += item.cost;
      monthly.set(month, row);
    }
  }

  return {
    vehicle: v.summary,
    isPro,
    range,
    currencySymbol: CURRENCY_SYMBOLS[currency],
    distanceUnit,
    economyUnit: v.economyUnit,
    electric: v.summary.fuelType === "electric",
    stats: {
      totalSpend: formatCurrency(totalGbp, currency, rates),
      currentMileage: `${Math.round(convertMilesToDisplay(v.currentMileage, distanceUnit)).toLocaleString("en-GB")} ${distanceUnit === "km" ? "km" : "miles"}`,
      economy: isPro ? (averageMpg ? formatFuelEconomy(averageMpg, v.economyUnit) : "-") : null,
      perDistance: isPro ? perDistance : null,
      yearSpend: isPro ? formatCurrency(v.yearSpend, currency, rates) : null,
    },
    breakdown: isPro
      ? SPEND_CATEGORIES.map(({ key, label }) => {
          const gbp = inRange[key].reduce((s, i) => s + i.cost, 0);
          return { key, label, amount: toDisplay(gbp), amountLabel: formatCurrency(gbp, currency, rates) };
        })
          .filter((row) => row.amount > 0)
          .sort((a, b) => b.amount - a.amount)
      : null,
    mileage: filterByDateRange(v.mileagePoints, range)
      .sort(byDate)
      .map((p) => ({ date: p.date, value: Math.round(convertMilesToDisplay(p.mileage, distanceUnit)) })),
    economySeries: isPro
      ? [...segments].sort(byDate).map((s) => ({ date: s.date, value: Math.round(fuelEconomyInUnit(s.mpg, v.economyUnit) * 10) / 10 }))
      : null,
    fuelCosts: isPro ? [...inRange.fuel].sort(byDate).map((f) => ({ date: f.date, value: toDisplay(f.cost) })) : null,
    monthly: isPro
      ? [...monthly.keys()].sort().map((month) => {
          const row = monthly.get(month)!;
          const values = Object.fromEntries(SPEND_CATEGORIES.map(({ key }) => [key, toDisplay(row[key])])) as Record<SpendCategory, number>;
          return { month, label: monthLabel(month), values };
        })
      : null,
  };
}
