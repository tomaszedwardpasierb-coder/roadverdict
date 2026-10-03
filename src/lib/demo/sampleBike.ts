// Place at: src/lib/demo/sampleBike.ts
//
// The sample bike behind the public demo (/demo): a made-up Yamaha MT-07
// with a year of made-up history. Nothing here is a real person's or a real
// account's data, and it lives in code, not in the database - so every
// visitor gets their own untouched copy, and nothing a visitor does can be
// seen by another. The page draws its figures and charts from these
// functions, and the demo's AI answers (api/demo/ask) get the same figures
// as facts, so what the page shows and what the AI says always agree.
export type DemoCategory = "service" | "fuel" | "mods" | "bills" | "labour";

export interface DemoEntry {
  id: string;
  date: string; // YYYY-MM-DD
  category: DemoCategory;
  description: string;
  cost: number;
  mileage?: number;
  litres?: number;
  // True for an entry the visitor just scanned.
  scanned?: boolean;
}

export const SAMPLE_BIKE = {
  name: "Yamaha MT-07",
  detail: "2019 · 689cc · sample bike",
  mileage: 12310,
  // The 12 months the charts show.
  windowStart: "2025-10",
  windowEnd: "2026-09",
} as const;

export const CATEGORY_LABELS: Record<DemoCategory, string> = {
  service: "Servicing",
  fuel: "Fuel",
  mods: "Parts & mods",
  bills: "Bills",
  labour: "Labour",
};

const PRICE_PER_LITRE: Record<string, number> = {
  "2025-10-11": 1.42, "2025-11-15": 1.41, "2025-12-20": 1.4, "2026-02-14": 1.43, "2026-03-28": 1.44, "2026-04-25": 1.45,
  "2026-05-23": 1.46, "2026-06-20": 1.45, "2026-07-18": 1.44, "2026-08-15": 1.46, "2026-09-12": 1.47,
};

function fill(date: string, mileage: number, litres: number): DemoEntry {
  return { id: `fuel-${date}`, date, category: "fuel", description: `${litres.toFixed(1)} L (full)`, cost: Math.round(litres * PRICE_PER_LITRE[date] * 100) / 100, mileage, litres };
}

export const SAMPLE_ENTRIES: DemoEntry[] = [
  fill("2025-10-11", 10700, 9.9),
  { id: "bill-ins", date: "2025-10-18", category: "bills", description: "Insurance (annual)", cost: 312.4 },
  { id: "svc-tyre", date: "2025-11-02", category: "service", description: "Rear tyre fitted (Michelin Road 6)", cost: 142, mileage: 10790 },
  { id: "mod-bungs", date: "2025-11-22", category: "mods", description: "Frame sliders", cost: 29.99, mileage: 10870 },
  fill("2025-11-15", 10830, 9.8),
  { id: "lab-valves", date: "2025-12-06", category: "labour", description: "Valve clearance check (labour)", cost: 85, mileage: 10920 },
  fill("2025-12-20", 10960, 9.6),
  { id: "bill-ved", date: "2026-01-12", category: "bills", description: "Road tax (12 months)", cost: 28 },
  fill("2026-02-14", 11060, 7.6),
  { id: "svc-brakes", date: "2026-03-05", category: "service", description: "Front brake pads (EBC)", cost: 64, mileage: 11130 },
  { id: "bill-mot", date: "2026-03-14", category: "bills", description: "MOT test", cost: 29.65 },
  fill("2026-03-28", 11200, 10.1),
  { id: "mod-tidy", date: "2026-04-04", category: "mods", description: "Tail tidy and bar-end mirrors", cost: 87.5, mileage: 11230 },
  fill("2026-04-25", 11360, 11.6),
  fill("2026-05-23", 11520, 11.9),
  { id: "lab-forks", date: "2026-05-09", category: "labour", description: "Fork oil change (labour)", cost: 60, mileage: 11590 },
  { id: "svc-chain", date: "2026-06-02", category: "service", description: "Chain and sprockets (DID kit)", cost: 215, mileage: 11560 },
  fill("2026-06-20", 11690, 12.8),
  fill("2026-07-18", 11860, 12.4),
  { id: "svc-lube", date: "2026-08-08", category: "service", description: "Chain lube and cleaner", cost: 18.99, mileage: 11990 },
  fill("2026-08-15", 12040, 13.3),
  fill("2026-09-12", 12230, 14.3),
];

// What's coming up - given to the AI so it can answer "when is my next
// service?", and shown on the page.
export const SAMPLE_REMINDERS = [
  { name: "Insurance renewal", due: "18 October 2026" },
  { name: "Basic service", due: "around 12,900 miles (every 4,000 miles)" },
  { name: "MOT", due: "14 March 2027" },
] as const;

const IMPERIAL_GALLON_LITRES = 4.54609;

export function monthsInWindow(): string[] {
  const out: string[] = [];
  let [y, m] = SAMPLE_BIKE.windowStart.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= SAMPLE_BIKE.windowEnd) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function monthLabel(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
}

export function inWindow(date: string): boolean {
  const month = date.slice(0, 7);
  return month >= SAMPLE_BIKE.windowStart && month <= SAMPLE_BIKE.windowEnd;
}

export function monthlySpend(entries: DemoEntry[]): { month: string; label: string; total: number }[] {
  const totals = new Map(monthsInWindow().map((m) => [m, 0]));
  for (const e of entries) {
    const month = e.date.slice(0, 7);
    if (totals.has(month)) totals.set(month, (totals.get(month) ?? 0) + e.cost);
  }
  return [...totals].map(([month, total]) => ({ month, label: monthLabel(month), total: Math.round(total * 100) / 100 }));
}

export function spendByCategory(entries: DemoEntry[]): { category: DemoCategory; label: string; total: number }[] {
  const totals = new Map<DemoCategory, number>();
  for (const e of entries) totals.set(e.category, (totals.get(e.category) ?? 0) + e.cost);
  return [...totals]
    .map(([category, total]) => ({ category, label: CATEGORY_LABELS[category], total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);
}

// Miles per gallon between consecutive fill-ups (the litres bought refill
// what the miles since the last one used).
export function fuelEconomy(entries: DemoEntry[]): { date: string; mpg: number }[] {
  const fills = entries
    .filter((e) => e.category === "fuel" && e.litres && e.mileage)
    .sort((a, b) => (a.mileage as number) - (b.mileage as number));
  const out: { date: string; mpg: number }[] = [];
  for (let i = 1; i < fills.length; i++) {
    const miles = (fills[i].mileage as number) - (fills[i - 1].mileage as number);
    const litres = fills[i].litres as number;
    if (miles > 0 && litres > 0) out.push({ date: fills[i].date, mpg: Math.round((miles / (litres / IMPERIAL_GALLON_LITRES)) * 10) / 10 });
  }
  return out;
}

// The shapes the dashboard's own chart components take (MpgChart,
// FuelCostChart, CategorySpendChart), so /demo can show the real charts
// on the sample bike instead of look-alikes.
export function mpgSeries(entries: DemoEntry[]) {
  const fills = entries
    .filter((e) => e.category === "fuel" && e.litres && e.mileage)
    .sort((a, b) => (a.mileage as number) - (b.mileage as number));
  const out = [];
  for (let i = 1; i < fills.length; i++) {
    const miles = (fills[i].mileage as number) - (fills[i - 1].mileage as number);
    const litres = fills[i].litres as number;
    if (miles > 0 && litres > 0) {
      out.push({ mileage: fills[i].mileage as number, mpg: Math.round((miles / (litres / IMPERIAL_GALLON_LITRES)) * 10) / 10, date: fills[i].date, fuelLogId: fills[i].id, miles, litres, likelyMissedFillUps: false });
    }
  }
  return out;
}

export function chartItems(entries: DemoEntry[], category: DemoCategory) {
  return entries.filter((e) => e.category === category).map((e) => ({ id: e.id, date: e.date, cost: e.cost, ...(e.mileage ? { mileage: e.mileage } : {}) }));
}

export function fuelPoints(entries: DemoEntry[]) {
  return entries.filter((e) => e.category === "fuel" && e.mileage).map((e) => ({ id: e.id, date: e.date, cost: e.cost, mileage: e.mileage as number }));
}

export interface DemoFigures {
  total: number;
  byCategory: { category: DemoCategory; label: string; total: number }[];
  servicing: number;
  fuel: number;
  milesRidden: number;
  costPerMile: number | null;
  averageMpg: number | null;
}

export function figuresFor(entries: DemoEntry[]): DemoFigures {
  const counted = entries.filter((e) => inWindow(e.date));
  const byCategory = spendByCategory(counted);
  const sum = (c: DemoCategory) => byCategory.find((x) => x.category === c)?.total ?? 0;
  const total = Math.round(counted.reduce((s, e) => s + e.cost, 0) * 100) / 100;
  const mileages = counted.map((e) => e.mileage).filter((m): m is number => typeof m === "number");
  const milesRidden = mileages.length > 1 ? Math.max(...mileages) - Math.min(...mileages) : 0;
  const economy = fuelEconomy(counted);
  return {
    total,
    byCategory,
    servicing: Math.round((sum("service") + sum("labour")) * 100) / 100,
    fuel: sum("fuel"),
    milesRidden,
    costPerMile: milesRidden > 0 ? Math.round((total / milesRidden) * 100) / 100 : null,
    averageMpg: economy.length > 0 ? Math.round((economy.reduce((s, x) => s + x.mpg, 0) / economy.length) * 10) / 10 : null,
  };
}

function pounds(n: number): string {
  return `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// The facts block the demo's AI answers from - plain text, every figure
// already worked out above, so the model only has to put it into words.
export function buildFactsBlock(entries: DemoEntry[]): string {
  const f = figuresFor(entries);
  const lines = [
    `Bike: ${SAMPLE_BIKE.name} (${SAMPLE_BIKE.detail}), about ${SAMPLE_BIKE.mileage.toLocaleString("en-GB")} miles. All figures cover the 12 months to September 2026.`,
    `Total spent: ${pounds(f.total)}.`,
    ...f.byCategory.map((c) => `Spent on ${c.label.toLowerCase()}: ${pounds(c.total)}.`),
    `Spent on servicing and labour together: ${pounds(f.servicing)}.`,
    `Miles ridden in the period: ${f.milesRidden.toLocaleString("en-GB")}.`,
    f.costPerMile !== null ? `Running cost per mile: ${pounds(f.costPerMile)}.` : "",
    f.averageMpg !== null ? `Average fuel economy: ${f.averageMpg} mpg.` : "",
    "Coming up: " + SAMPLE_REMINDERS.map((r) => `${r.name} (${r.due})`).join("; ") + ".",
    "Entries (date, kind, what, cost):",
    ...[...entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((e) => `- ${e.date}, ${CATEGORY_LABELS[e.category].toLowerCase()}, ${e.description}${e.scanned ? " (scanned from the visitor's receipt)" : ""}, ${pounds(e.cost)}`),
  ];
  return lines.filter(Boolean).join("\n");
}
