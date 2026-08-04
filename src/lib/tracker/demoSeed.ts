// Place at: src/lib/tracker/demoSeed.ts
import { getAdjustedBenchmark, type BikeClass, type Region, type JobType } from "@/lib/priceData";
import { guessModCategory } from "./guessCategory";

export const DEMO_EMAIL = "demo@roadverdict.co.uk";
export const DEMO_MAKE = "Yamaha";
export const DEMO_MODEL = "MT-07";
export const DEMO_ENGINE_CC = 689;
export const DEMO_BIKE_CLASS: BikeClass = "medium";
export const DEMO_REGION: Region = "rest-england-wales";
export const DEMO_REGISTRATION = "YA16 MTO";
export const DEMO_NICKNAME = "Demo MT-07";
const DEMO_BRAND_VALUE = "yamaha";

// Deterministic PRNG (mulberry32) - same seed always produces the exact
// same sequence, so "Reset Demo" restores an identical dataset every
// time rather than a freshly-random one. Real Math.random() would make
// the demo different on every reset, which defeats the point of a
// dependable, repeatable walkthrough.
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Roughly plausible historical UK average pump price per litre, year by
// year - not a precise record, but the 2022 spike and the settling back
// down since are the two features worth getting right for something
// that looks believable at a glance.
const YEARLY_FUEL_PRICE = [1.15, 1.2, 1.25, 1.28, 1.15, 1.35, 1.65, 1.5, 1.45, 1.42];

// Total miles ridden per year - not perfectly smooth on purpose, real
// ownership has better and worse years.
const YEARLY_MILEAGE = [3200, 3450, 3050, 3600, 3850, 3300, 3550, 3950, 3700, 4050];

// Jan..Dec - UK riding season peaks Jun-Aug, drops hard over winter.
const MONTH_SEASONAL_WEIGHT = [0.6, 0.65, 0.85, 1.1, 1.3, 1.5, 1.5, 1.4, 1.15, 0.9, 0.65, 0.55];

export interface DemoFuelEntry {
  date: string;
  mileage: number;
  litres: number;
  cost: number;
  filledToFull: boolean;
}
export interface DemoServiceEntry {
  date: string;
  mileage: number;
  jobType: string;
  cost: number;
}
export interface DemoModEntry {
  date: string;
  mileage: number;
  category: string;
  name: string;
  cost: number;
}
export interface DemoBillEntry {
  date: string;
  billType: string;
  cost: number;
}

export interface DemoDataset {
  fuel: DemoFuelEntry[];
  service: DemoServiceEntry[];
  mods: DemoModEntry[];
  bills: DemoBillEntry[];
  finalMileage: number;
}

// Generates the whole 10-year history ending "now" - dates are always
// relative to whenever this actually runs, so the demo looks current no
// matter when someone seeds or resets it, rather than drifting into the
// past the longer the app has been live.
export function generateDemoDataset(now: Date = new Date()): DemoDataset {
  const rand = mulberry32(42);

  // Cumulative mileage at the end of each of the 120 months, seasonally
  // weighted within each year - this single timeline is what every
  // category's mileage gets read from, so a service and a fuel fill-up
  // on nearby dates always land on consistent, sensible mileage figures.
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
    return Math.round(before + frac * (after - before));
  }

  function benchmarkCost(job: JobType, biasHigh = false): number {
    const bench = getAdjustedBenchmark(job, DEMO_BIKE_CLASS, DEMO_BRAND_VALUE, DEMO_REGION);
    if (biasHigh) return Math.round(bench.high * 1.15);
    return Math.round(bench.low + rand() * (bench.high - bench.low));
  }

  // FUEL - seasonal fill-up frequency, real litres/price maths.
  const fuel: DemoFuelEntry[] = [];
  for (let m = 0; m < 120; m++) {
    const yearIndex = Math.floor(m / 12);
    const monthOfYear = m % 12;
    const weight = MONTH_SEASONAL_WEIGHT[monthOfYear];
    const fillCount = weight > 1.2 ? 4 : weight > 0.9 ? 3 : weight > 0.7 ? 2 : 1;
    const pricePerLitre = YEARLY_FUEL_PRICE[yearIndex];
    for (let f = 0; f < fillCount; f++) {
      const day = 1 + Math.floor(rand() * 27);
      const litres = Math.round((9 + rand() * 4) * 100) / 100;
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

  // SERVICE - annual basic/full alternating, plus realistic-interval
  // tyres, chain and sprockets, brake pads, one valve clearance and one
  // battery. Costs pulled from the app's own benchmark data, so the
  // Verdict badges on these entries look and behave exactly like a real
  // logged service would - one entry (year 6's service) is deliberately
  // priced above benchmark, so the "High" verdict has something real to
  // show in the demo rather than everything being uniformly "Fair".
  const service: DemoServiceEntry[] = [];
  for (let year = 1; year <= 10; year++) {
    const monthIndex = year * 12 - 6;
    const day = 10 + Math.floor(rand() * 10);
    const job: JobType = year % 2 === 0 ? "full-service" : "basic-service";
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: job, cost: benchmarkCost(job, year === 6) });
  }
  for (let i = 0; i < 6; i++) {
    const monthIndex = Math.round(9 + i * 18);
    if (monthIndex >= 119) break;
    const day = 5 + Math.floor(rand() * 15);
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: "tyres-pair", cost: benchmarkCost("tyres-pair") });
  }
  for (let i = 0; i < 5; i++) {
    const monthIndex = Math.round(11 + i * 24);
    if (monthIndex >= 119) break;
    const day = 5 + Math.floor(rand() * 15);
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: "chain-and-sprockets", cost: benchmarkCost("chain-and-sprockets") });
  }
  for (let i = 0; i < 4; i++) {
    const monthIndex = Math.round(14 + i * 30);
    if (monthIndex >= 119) break;
    const day = 5 + Math.floor(rand() * 15);
    service.push({ date: dateAt(monthIndex, day), mileage: mileageAt(monthIndex, day), jobType: "brake-pads-front", cost: benchmarkCost("brake-pads-front") });
  }
  service.push({ date: dateAt(84, 12), mileage: mileageAt(84, 12), jobType: "valve-clearance", cost: 220 });
  service.push({ date: dateAt(70, 18), mileage: mileageAt(70, 18), jobType: "battery", cost: 65 });
  service.sort((a, b) => a.date.localeCompare(b.date));

  // MODS - a handful of plausible accessories spread across the decade,
  // each resolved to a real catalog category via the same fuzzy-matching
  // heuristic the AI receipt scanner uses, rather than hand-picking
  // category keys that might not actually exist.
  const modPlan: { monthIndex: number; description: string; cost: number }[] = [
    { monthIndex: 2, description: "Tail tidy", cost: 45 },
    { monthIndex: 4, description: "Crash bungs", cost: 62 },
    { monthIndex: 6, description: "Disc lock", cost: 34 },
    { monthIndex: 16, description: "Tank bag", cost: 68 },
    { monthIndex: 30, description: "Heated grips", cost: 92 },
    { monthIndex: 44, description: "Aftermarket exhaust", cost: 375 },
    { monthIndex: 58, description: "Phone mount", cost: 27 },
    { monthIndex: 68, description: "Tyre pressure monitor", cost: 46 },
    { monthIndex: 92, description: "Frame sliders", cost: 54 },
  ];
  const mods: DemoModEntry[] = modPlan.map((item) => {
    const day = 5 + Math.floor(rand() * 18);
    return {
      date: dateAt(item.monthIndex, day),
      mileage: mileageAt(item.monthIndex, day),
      category: guessModCategory(item.description) ?? "other-accessory",
      name: item.description,
      cost: item.cost,
    };
  });

  // BILLS - annual insurance and road tax from year 1, MOT joining from
  // year 3 onward (a bike's first UK MOT isn't due until it's 3 years old).
  const bills: DemoBillEntry[] = [];
  for (let year = 1; year <= 10; year++) {
    const monthIndex = year * 12 - 12;
    const day = 1 + Math.floor(rand() * 10);
    bills.push({ date: dateAt(monthIndex, day), billType: "insurance", cost: Math.round(165 + rand() * 110) });
    bills.push({ date: dateAt(monthIndex, day + 2), billType: "road-tax", cost: 105 + Math.min(year, 15) });
    if (year >= 3) {
      bills.push({ date: dateAt(monthIndex, day + 5), billType: "mot-test", cost: 25 + Math.floor(rand() * 5) });
    }
  }
  bills.sort((a, b) => a.date.localeCompare(b.date));

  const finalMileage = fuel.length > 0 ? fuel[fuel.length - 1].mileage : Math.round(monthCumulative[monthCumulative.length - 1]);

  return { fuel, service, mods, bills, finalMileage };
}
