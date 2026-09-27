// Place at: src/lib/app/toolsData.ts
//
// The Android app's quote checker and cost calculator, for one of the
// signed-in owner's own vehicles: the same choices the web's QuoteForm /
// CarQuoteForm and CostCalculatorForm / CarCostCalculatorForm offer,
// starting from that vehicle (lib/tracker/quoteDefaults.ts - what the web
// forms start from too), plus the words a verdict is shown with. The
// checks themselves go to the website's own routes: /api/verdict,
// /api/cars/verdict, /api/cost-calculator and /api/cars/cost-calculator.
import { getBike } from "@/lib/tracker/bike";
import { getCarById } from "@/lib/tracker/car";
import type { VehicleKind } from "@/lib/tracker/activeVehicle";
import { bikeQuoteDefaults, carQuoteDefaults } from "@/lib/tracker/quoteDefaults";
import { BIKE_CLASS_LABELS, BRAND_OPTIONS, JOB_LABELS, REGION_LABELS, type Region } from "@/lib/priceData";
import { CAR_BRAND_OPTIONS, CAR_JOB_LABELS_BENCHMARKED, CAR_REGION_LABELS, CAR_SIZE_CLASS_LABELS } from "@/lib/carPriceData";
import { VERDICT_LABELS, VERDICT_SUMMARIES, type Verdict } from "@/lib/verdict";
import { sportsbikeshopLinksForJob, type AffiliateLink } from "@/lib/affiliates";

type Option = { value: string; label: string };

// The fuels the car cost calculator can price, in the web form's words.
// A fully electric car isn't one of them - there isn't enough sourced UK
// running-cost data yet (see lib/carCostCalculator.ts).
const CALCULATOR_FUELS: Option[] = [
  { value: "petrol", label: "Petrol" },
  { value: "diesel", label: "Diesel" },
  { value: "hybrid", label: "Hybrid" },
  { value: "phev", label: "Plug-in hybrid (PHEV)" },
];

export type ToolsScreen = {
  kind: VehicleKind;
  options: { brands: Option[]; classes: Option[]; jobs: Option[]; regions: Option[]; fuels: Option[] };
  defaults: {
    brand: string;
    vehicleClass: string;
    region: Region;
    // Cars only: the car's own fuel when the calculator can price it.
    fuel: string | null;
  };
  // Cars only: an electric car, which the cost calculator can't price.
  electric: boolean;
  verdicts: Record<Verdict, { label: string; summary: string }>;
  // Motorcycles only: Sportsbikeshop parts for the quoted job, shown under
  // the verdict whatever it says - the same line the web shows.
  partsLinks: Record<string, AffiliateLink[]>;
};

const toOptions = (labels: Record<string, string>): Option[] => Object.entries(labels).map(([value, label]) => ({ value, label }));

// The summaries are written about bikes; a car's verdict says "car".
function verdictWords(kind: VehicleKind): ToolsScreen["verdicts"] {
  const words = {} as ToolsScreen["verdicts"];
  for (const v of Object.keys(VERDICT_LABELS) as Verdict[]) {
    const summary = VERDICT_SUMMARIES[v];
    words[v] = { label: VERDICT_LABELS[v], summary: kind === "car" ? summary.replace(/\bbike\b/g, "car") : summary };
  }
  return words;
}

export async function getToolsScreen(email: string, kind: VehicleKind, id: string): Promise<ToolsScreen | null> {
  if (kind === "bike") {
    const bike = await getBike(email, id);
    if (!bike) return null;
    const start = bikeQuoteDefaults(bike);
    const jobs = toOptions(JOB_LABELS);
    return {
      kind,
      options: {
        brands: BRAND_OPTIONS.map(({ value, label }) => ({ value, label })),
        classes: toOptions(BIKE_CLASS_LABELS),
        jobs,
        regions: toOptions(REGION_LABELS),
        fuels: [],
      },
      defaults: { brand: start.brand, vehicleClass: start.bikeClass, region: bike.region ?? "rest-england-wales", fuel: null },
      electric: false,
      verdicts: verdictWords(kind),
      partsLinks: Object.fromEntries(
        jobs.map((j) => [j.value, sportsbikeshopLinksForJob(j.value, "quoteChecker")] as const).filter(([, links]) => links.length > 0)
      ),
    };
  }

  const car = await getCarById(email, id);
  if (!car) return null;
  const start = carQuoteDefaults(car);
  return {
    kind,
    options: {
      brands: CAR_BRAND_OPTIONS.map(({ value, label }) => ({ value, label })),
      classes: toOptions(CAR_SIZE_CLASS_LABELS),
      jobs: toOptions(CAR_JOB_LABELS_BENCHMARKED),
      regions: toOptions(CAR_REGION_LABELS),
      fuels: CALCULATOR_FUELS,
    },
    // "medium" and "petrol" are the web forms' own starting choices when
    // the car itself doesn't settle them.
    defaults: {
      brand: start.brand,
      vehicleClass: start.carClass ?? "medium",
      region: car.region ?? "rest-england-wales",
      fuel: CALCULATOR_FUELS.some((f) => f.value === car.fuelType) ? car.fuelType : "petrol",
    },
    electric: car.fuelType === "electric",
    verdicts: verdictWords(kind),
    partsLinks: {},
  };
}
