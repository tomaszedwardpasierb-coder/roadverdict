// Place at: src/lib/tracker/demoCarSeed.ts
//
// The car equivalent of demoSeed.ts - same deterministic-PRNG, same
// 120-month cumulative-mileage timeline approach, kept in its own file
// rather than folded into demoSeed.ts since the job/mod/bill catalogs,
// benchmark function, and CarFuelType are all genuinely different from
// the bike side (see the ADR referenced throughout car*.ts). Pure and
// Cosmos-free, same reason as demoSeed.ts's own comment.
import { getAdjustedCarBenchmark, type CarBenchmarkClass, type CarJobType } from "@/lib/carPriceData";
import type { Region } from "@/lib/priceData";
import { guessCarModCategory } from "./carGuessCategory";

export const DEMO_CAR_MAKE = "BMW";
export const DEMO_CAR_MODEL = "640i Gran Coupe";
export const DEMO_CAR_FUEL_TYPE = "petrol" as const;
export const DEMO_CAR_ENGINE_LITRES = 3.0;
export const DEMO_CAR_CLASS: CarBenchmarkClass = "large";
export const DEMO_CAR_REGION: Region = "rest-england-wales";
export const DEMO_CAR_REGISTRATION = "PA63 ERB";
export const DEMO_CAR_YEAR = 2013;
export const DEMO_CAR_NICKNAME = "Demo 640i";
const DEMO_CAR_BRAND_VALUE = "bmw";

// Bought used, 3 years and ~28,000 miles into its life, rather than
// pretending tracking started from new - mayHavePriorHistory (passed at
// creation) is exactly the flag this scenario exists for, and it makes
// the 63-plate (registered second half of 2013) consistent with only
// ever logging the most recent 10 years.
const BASE_MILEAGE = 28_000;

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Real UK unleaded pump price per litre, year by year - same 2022 spike
// shape as the bike's fuel table, scaled to petrol rather than mixed.
const YEARLY_FUEL_PRICE = [1.32, 1.28, 1.35, 1.38, 1.25, 1.45, 1.75, 1.6, 1.55, 1.52];

// A big GT saloon driven regularly but not as a high-mileage daily -
// noticeably more than the bike's own yearly figures, less than a
// commuter-hatchback average.
const YEARLY_MILEAGE = [8200, 8600, 7900, 9100, 8700, 9400, 7600, 8900, 9600, 9200];

const MONTH_SEASONAL_WEIGHT = [0.85, 0.85, 0.95, 1.0, 1.05, 1.1, 1.05, 1.0, 1.0, 1.0, 0.95, 0.9];

export interface DemoCarFuelEntry {
  date: string;
  mileage: number;
  litres: number;
  cost: number;
  filledToFull: boolean;
}
export interface DemoCarServiceEntry {
  date: string;
  mileage: number;
  jobType: string;
  cost: number;
}
export interface DemoCarModEntry {
  date: string;
  mileage: number;
  category: string;
  name: string;
  cost: number;
}
export interface DemoCarBillEntry {
  date: string;
  billType: string;
  cost: number;
}

export interface DemoCarDataset {
  fuel: DemoCarFuelEntry[];
  service: DemoCarServiceEntry[];
  mods: DemoCarModEntry[];
  bills: DemoCarBillEntry[];
  finalMileage: number;
}

// Mirrors demoSeed.ts's generateDemoDataset exactly in structure - see
// its own comment for why dates are always relative to "now".
export function generateDemoCarDataset(now: Date = new Date()): DemoCarDataset {
  const rand = mulberry32(43);

  const monthCumulative: number[] = [0];
  for (let y = 0; y < 10; y++) {
    const weightSum = MONTH_SEASONAL_WEIGHT.reduce((a, b) => a + b, 0);
    for (let m = 0; m < 12; m++) {
      const monthMiles = (YEARLY_MILEAGE[y] * MONTH_SEASONAL_WEIGHT[m]) / weightSum;
      monthCumulative.push(monthCumulative[monthCumulative.length - 1] + monthMiles);
    }
  }

  function dateAt(monthIndex: number, day: number): string {
    const d = new Date(now);
    d.setDate(1);
    d.setMonth(d.getMonth() - (120 - monthIndex));
    d.setDate(Math.min(day, 28));
    return d.toISOString().slice(0, 10);
  }

  function mileageAt(monthIndex: number, day: number): number {
    const before = monthCumulative[monthIndex] ?? 0;
    const after = monthCumulative[monthIndex + 1] ?? before;
    const frac = Math.min(Math.max(day / 28, 0), 1);
    return BASE_MILEAGE + Math.round(before + frac * (after - before));
  }

  function benchmarkCost(job: CarJobType, biasHigh = false): number {
    const bench = getAdjustedCarBenchmark(job, DEMO_CAR_CLASS, DEMO_CAR_BRAND_VALUE, DEMO_CAR_REGION);
    if (biasHigh) return Math.round(bench.high * 1.15);
    return Math.round(bench.low + rand() * (bench.high - bench.low));
  }

  // FUEL - a 3.0L petrol six drinks more per fill than the bike ever
  // did, and gets filled more often per month at this mileage.
  const fuel: DemoCarFuelEntry[] = [];
  for (let m = 0; m < 120; m++) {
    const yearIndex = Math.floor(m / 12);
    const monthOfYear = m % 12;
    const weight = MONTH_SEASONAL_WEIGHT[monthOfYear];
    const fillCount = weight > 1.0 ? 3 : 2;
    const pricePerLitre = YEARLY_FUEL_PRICE[yearIndex];
    for (let f = 0; f < fillCount; f++) {
      const day = 1 + Math.floor(rand() * 27);
      const litres = Math.round((45 + rand() * 15) * 100) / 100;
      fuel.push({
        date: dateAt(m, day),
        mileage: mileageAt(m, day),
        litres,
        cost: Math.round(litres * pricePerLitre * 100) / 100,
        filledToFull: true,
      });
    }
  }
  fuel.sort((a, b) => a.date.localeCompare(b.date));

  // SERVICE - annual interim/full alternating (matches
  // CAR_JOB_REMINDER_DEFAULTS' own 6k/12k mile intervals against this
  // car's ~8-9k/year), plus tyres (a heavy RWD six wears its rear tyres
  // faster than a family hatchback), brakes, and the handful of
  // BMW-specific big-ticket jobs a real 13-year-old 640i would have
  // seen by now. Year 5's full service is deliberately priced above
  // benchmark, same reasoning as the bike's own year-6 entry - one real
  // "High" verdict for the demo to show, not everything uniformly "Fair".
  const service: DemoCarServiceEntry[] = [];
  for (let year = 1; year <= 10; year++) {
    const monthIndex = year * 12 - 6;
    const day = 8 + Math.floor(rand() * 12);
    const job: CarJobType = year % 2 === 0 ? "full-service" : "interim-service";
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: job, cost: benchmarkCost(job, year === 5) });
  }
  for (let i = 0; i < 4; i++) {
    const monthIndex = Math.round(14 + i * 24);
    if (monthIndex >= 119) break;
    const day = 5 + Math.floor(rand() * 15);
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: "tyres-front-pair", cost: benchmarkCost("tyres-front-pair") });
  }
  service.push({ date: dateAt(38, 20), mileage: mileageAt(38, 20), jobType: "tyres-full-set", cost: 540 });
  service.push({ date: dateAt(77, 9), mileage: mileageAt(77, 9), jobType: "tyres-single", cost: 145 });
  for (let i = 0; i < 3; i++) {
    const monthIndex = Math.round(20 + i * 30);
    if (monthIndex >= 119) break;
    const day = 5 + Math.floor(rand() * 15);
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: "brake-pads-front", cost: benchmarkCost("brake-pads-front") });
  }
  service.push({ date: dateAt(64, 14), mileage: mileageAt(64, 14), jobType: "brake-discs", cost: 385 });
  service.push({ date: dateAt(52, 22), mileage: mileageAt(52, 22), jobType: "gearbox-oil", cost: 185 });
  service.push({ date: dateAt(96, 6), mileage: mileageAt(96, 6), jobType: "battery-12v", cost: 155 });
  service.push({ date: dateAt(30, 17), mileage: mileageAt(30, 17), jobType: "aircon-regas", cost: 95 });
  service.push({ date: dateAt(108, 11), mileage: mileageAt(108, 11), jobType: "wheel-alignment", cost: 65 });
  service.sort((a, b) => a.date.localeCompare(b.date));

  // MODS - leans into a real BMW owner's usual mod list (see the About
  // page's own "petrolhead" framing) rather than generic accessories.
  const modPlan: { monthIndex: number; description: string; cost: number }[] = [
    { monthIndex: 5, description: "Dash cam", cost: 89 },
    { monthIndex: 19, description: "Window tint", cost: 220 },
    { monthIndex: 34, description: "ECU remap", cost: 450 },
    { monthIndex: 48, description: "Alloy wheels", cost: 980 },
    { monthIndex: 63, description: "Aftermarket exhaust", cost: 720 },
    { monthIndex: 89, description: "Parking sensors", cost: 165 },
  ];
  const mods: DemoCarModEntry[] = modPlan.map((item) => {
    const day = 5 + Math.floor(rand() * 18);
    return {
      date: dateAt(item.monthIndex, day),
      mileage: mileageAt(item.monthIndex, day),
      category: guessCarModCategory(item.description) ?? "other-accessory",
      name: item.description,
      cost: item.cost,
    };
  });

  // BILLS - insurance/road-tax/MOT every year (this car has been well
  // past the 3-year MOT threshold for its entire logged history), plus
  // a couple of Congestion Charge entries for a car that's clearly been
  // into a city centre now and then.
  const bills: DemoCarBillEntry[] = [];
  for (let year = 1; year <= 10; year++) {
    const monthIndex = year * 12 - 12;
    const day = 1 + Math.floor(rand() * 10);
    bills.push({ date: dateAt(monthIndex, day), billType: "insurance", cost: Math.round(420 + rand() * 260) });
    bills.push({ date: dateAt(monthIndex, day + 2), billType: "road-tax", cost: Math.round(295 + rand() * 40) });
    bills.push({ date: dateAt(monthIndex, day + 5), billType: "mot-test", cost: 45 + Math.floor(rand() * 10) });
  }
  bills.push({ date: dateAt(41, 16), billType: "congestion", cost: 15 });
  bills.push({ date: dateAt(87, 3), billType: "congestion", cost: 15 });
  bills.sort((a, b) => a.date.localeCompare(b.date));

  const finalMileage = fuel.length > 0 ? fuel[fuel.length - 1].mileage : BASE_MILEAGE + Math.round(monthCumulative[monthCumulative.length - 1]);

  return { fuel, service, mods, bills, finalMileage };
}
