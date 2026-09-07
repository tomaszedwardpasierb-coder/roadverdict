/**
 * Car equivalent of priceData.ts - same provenance discipline (named
 * source, publish date, confidence level, honest notes where a figure is
 * derived rather than directly quoted), same multiplier mechanism
 * (brand tier x region x inflation-since-research). A fresh, independent
 * table, not an extension of the motorcycle one - the two vehicle kinds'
 * price research has nothing in common to share, and REGION_MULTIPLIER/
 * BRAND_TIER_MULTIPLIER aren't exported from priceData.ts anyway (only
 * the Region *type* is reused below, erased at compile time - same
 * "type-only imports may cross the sister-schema line" rule this whole
 * build has followed since Phase 2).
 *
 * All prices checked 2026-09-07. Sources per row below; every cell here
 * is small/medium/large only - CarSizeClass's 4th member, 'electric', is
 * deliberately NOT covered (see RoadVerdict_Car_Plan_v3.md's Phase 7
 * section: "too few reference points for sourced data yet"). Callers
 * must check for an electric-classed car before calling getCarBenchmark/
 * getAdjustedCarBenchmark - it is not this module's job to gate that.
 */
import type { Region, PriceRange, BenchmarkSource } from './priceData';
import { INFLATION_MULTIPLIER_SINCE_RESEARCH } from './inflation';

export type CarBrandTier = 'budget' | 'mainstream' | 'premium';

export interface CarBrandOption {
  value: string;
  label: string;
  tier: CarBrandTier;
}

// Tiered by well-known UK market positioning, same "directionally
// reasonable, not a rate-card" honesty as priceData.ts's own
// BRAND_TIER_MULTIPLIER comment - not every one of these 41 brands has
// an individually sourced service-cost figure, and claiming otherwise
// would be exactly the "guessed number wearing a confidence label" this
// app's conventions warn against. All 41 brands from carModels.ts's
// ALL_CAR_BRANDS.
export const CAR_BRAND_OPTIONS: CarBrandOption[] = [
  { value: 'abarth', label: 'Abarth', tier: 'premium' },
  { value: 'alfa-romeo', label: 'Alfa Romeo', tier: 'premium' },
  { value: 'audi', label: 'Audi', tier: 'premium' },
  { value: 'bmw', label: 'BMW', tier: 'premium' },
  { value: 'byd', label: 'BYD', tier: 'budget' },
  { value: 'chevrolet', label: 'Chevrolet', tier: 'mainstream' },
  { value: 'citroen', label: 'Citroën', tier: 'mainstream' },
  { value: 'ds-automobiles', label: 'DS Automobiles', tier: 'premium' },
  { value: 'dacia', label: 'Dacia', tier: 'budget' },
  { value: 'fiat', label: 'Fiat', tier: 'mainstream' },
  { value: 'ford', label: 'Ford', tier: 'mainstream' },
  { value: 'honda', label: 'Honda', tier: 'mainstream' },
  { value: 'hyundai', label: 'Hyundai', tier: 'mainstream' },
  { value: 'isuzu', label: 'Isuzu', tier: 'mainstream' },
  { value: 'jaguar', label: 'Jaguar', tier: 'premium' },
  { value: 'jeep', label: 'Jeep', tier: 'premium' },
  { value: 'kia', label: 'Kia', tier: 'mainstream' },
  { value: 'land-rover', label: 'Land Rover', tier: 'premium' },
  { value: 'lexus', label: 'Lexus', tier: 'premium' },
  { value: 'mg', label: 'MG', tier: 'budget' },
  { value: 'mini', label: 'MINI', tier: 'premium' },
  { value: 'mazda', label: 'Mazda', tier: 'mainstream' },
  { value: 'mercedes-benz', label: 'Mercedes-Benz', tier: 'premium' },
  { value: 'mitsubishi', label: 'Mitsubishi', tier: 'mainstream' },
  { value: 'nissan', label: 'Nissan', tier: 'mainstream' },
  { value: 'peugeot', label: 'Peugeot', tier: 'mainstream' },
  { value: 'polestar', label: 'Polestar', tier: 'premium' },
  { value: 'porsche', label: 'Porsche', tier: 'premium' },
  { value: 'renault', label: 'Renault', tier: 'mainstream' },
  { value: 'seat', label: 'SEAT', tier: 'mainstream' },
  { value: 'saab', label: 'Saab', tier: 'mainstream' },
  { value: 'smart', label: 'Smart', tier: 'mainstream' },
  { value: 'ssangyong', label: 'SsangYong', tier: 'budget' },
  { value: 'subaru', label: 'Subaru', tier: 'mainstream' },
  { value: 'suzuki', label: 'Suzuki', tier: 'mainstream' },
  { value: 'tesla', label: 'Tesla', tier: 'premium' },
  { value: 'toyota', label: 'Toyota', tier: 'mainstream' },
  { value: 'vauxhall', label: 'Vauxhall', tier: 'mainstream' },
  { value: 'volkswagen', label: 'Volkswagen', tier: 'mainstream' },
  { value: 'volvo', label: 'Volvo', tier: 'premium' },
  { value: 'skoda', label: 'Škoda', tier: 'mainstream' },
  { value: 'other', label: 'Other / not sure', tier: 'mainstream' },
];

const CAR_BRAND_TIER_MULTIPLIER: Record<CarBrandTier, number> = {
  budget: 0.88,
  mainstream: 1.0,
  premium: 1.3,
};

export type CarRegion = Region;
export const CAR_REGION_LABELS: Record<CarRegion, string> = {
  'london-se': 'London & South East',
  'rest-england-wales': 'Rest of England & Wales',
  'scotland-ni': 'Scotland & Northern Ireland',
};
const CAR_REGION_MULTIPLIER: Record<CarRegion, number> = {
  'london-se': 1.15,
  'rest-england-wales': 1.0,
  'scotland-ni': 0.95,
};

export type CarBenchmarkClass = 'small' | 'medium' | 'large';

export type CarJobType =
  | 'oil-filter'
  | 'interim-service'
  | 'full-service'
  | 'brake-pads-front'
  | 'tyres-front-pair';

export interface CarBenchmark extends PriceRange {
  source: BenchmarkSource;
}

type CarBenchmarkTable = Record<CarJobType, Record<CarBenchmarkClass, CarBenchmark>>;

const derivedNote = (fromLabel: string) =>
  `Derived as a fraction of ${fromLabel} - no source prices this job in isolation.`;

export const CAR_BENCHMARKS: CarBenchmarkTable = {
  'full-service': {
    small: {
      low: 150, high: 250,
      source: {
        sourceName: 'Checkatrade car service cost guide (small/mainstream-car examples), cross-checked against Bumper.co\'s national range',
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'medium',
        note: 'Size-banded examples (Fiesta/Polo-class), not a single quoted figure for this exact band.',
      },
    },
    medium: {
      low: 200, high: 350,
      source: {
        sourceName: 'Checkatrade car service cost guide (3-Series/A4-class examples), cross-checked against Bumper.co\'s national range',
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'medium',
        note: 'Bumper.co\'s own national average (£280) sits inside this band.',
      },
    },
    large: {
      low: 300, high: 450,
      source: {
        sourceName: 'Checkatrade car service cost guide (prestige-car examples)',
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: '"Prestige" examples span a very wide range in the source - widest band of the three sizes on purpose.',
      },
    },
  },
  'interim-service': {
    small: {
      low: 90, high: 150,
      source: {
        sourceName: derivedNote('the full-service figure'),
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'Computed as roughly 65% of full-service.',
      },
    },
    medium: {
      low: 120, high: 210,
      source: {
        sourceName: 'Bumper.co national interim-service range',
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'medium',
        note: 'The one row with a direct national quote (£110-210) rather than a derived figure - it brackets this size almost exactly.',
      },
    },
    large: {
      low: 160, high: 260,
      source: {
        sourceName: derivedNote('the full-service figure'),
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'Computed as roughly 65% of full-service.',
      },
    },
  },
  'oil-filter': {
    small: {
      low: 70, high: 110,
      source: {
        sourceName: derivedNote('the full-service figure'),
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'Computed as roughly 45% of full-service - no source prices an oil-only change separately from a service.',
      },
    },
    medium: {
      low: 90, high: 140,
      source: {
        sourceName: derivedNote('the full-service figure'),
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'Computed as roughly 45% of full-service.',
      },
    },
    large: {
      low: 120, high: 170,
      source: {
        sourceName: derivedNote('the full-service figure'),
        sourceDate: '2026-05-15',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'Computed as roughly 45% of full-service.',
      },
    },
  },
  'brake-pads-front': {
    small: {
      low: 90, high: 130,
      source: {
        sourceName: 'RAC Drive, "How much does it cost to replace brake pads?" - national average quoted, banded down for a lighter car',
        sourceDate: '2026-07-30',
        lastReviewed: '2026-09-07',
        confidence: 'medium',
        note: 'RAC\'s own average (£128) is quoted nationally, not per size - banding is a reasonable derivation, not a separately sourced figure.',
      },
    },
    medium: {
      low: 110, high: 150,
      source: {
        sourceName: 'RAC Drive, "How much does it cost to replace brake pads?"',
        sourceDate: '2026-07-30',
        lastReviewed: '2026-09-07',
        confidence: 'higher',
        note: 'RAC\'s quoted national average (£128) sits directly inside this band - the best-anchored row in this table.',
      },
    },
    large: {
      low: 140, high: 190,
      source: {
        sourceName: 'RAC Drive, "How much does it cost to replace brake pads?" - national average quoted, banded up for a heavier car',
        sourceDate: '2026-07-30',
        lastReviewed: '2026-09-07',
        confidence: 'medium',
        note: 'Banded up from RAC\'s national average, not a separately sourced figure for large cars specifically.',
      },
    },
  },
  'tyres-front-pair': {
    small: {
      low: 140, high: 220,
      source: {
        sourceName: 'tyresavings.com 2026 tyre price guide - mid-range per-tyre price plus fitting, banded down for smaller wheels',
        sourceDate: '2026-05-01',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'The source doesn\'t split by car size directly - only by tyre quality tier and a general "bigger wheels cost more" comment used to derive this band.',
      },
    },
    medium: {
      low: 160, high: 290,
      source: {
        sourceName: 'tyresavings.com 2026 tyre price guide - "everyday car" mid-range tyre (£70-120) plus fitting (£10-25), pair price',
        sourceDate: '2026-05-01',
        lastReviewed: '2026-09-07',
        confidence: 'medium',
        note: 'The source\'s own "typical cost for most everyday cars" figure anchors this band directly.',
      },
    },
    large: {
      low: 260, high: 400,
      source: {
        sourceName: 'tyresavings.com 2026 tyre price guide - mid-range per-tyre price plus fitting, banded up for larger wheels',
        sourceDate: '2026-05-01',
        lastReviewed: '2026-09-07',
        confidence: 'lower',
        note: 'Derived from the same "bigger wheels cost more" commentary as the small band, not a separately quoted large-car figure.',
      },
    },
  },
};

export const CAR_JOB_LABELS_BENCHMARKED: Record<CarJobType, string> = {
  'oil-filter': 'Oil & filter change',
  'interim-service': 'Interim service',
  'full-service': 'Full service',
  'brake-pads-front': 'Brake pads (front)',
  'tyres-front-pair': 'Tyres (front pair)',
};

export const CAR_SIZE_CLASS_LABELS: Record<CarBenchmarkClass, string> = {
  small: 'Small (up to 1.2L)',
  medium: 'Medium (1.3-2.0L)',
  large: 'Large (over 2.0L)',
};

export function getCarBenchmark(job: CarJobType, carClass: CarBenchmarkClass): CarBenchmark {
  return CAR_BENCHMARKS[job][carClass];
}

export function getCarBrandTier(brandValue: string): CarBrandTier {
  return CAR_BRAND_OPTIONS.find((b) => b.value === brandValue)?.tier ?? 'mainstream';
}

// Car equivalent of motorcycleModels.ts's slugifyMake - needs the extra
// diacritic-stripping step that one doesn't (a plain lowercase-and-hyphen
// slug of "Škoda"/"Citroën" wouldn't match this file's own
// "skoda"/"citroen" CAR_BRAND_OPTIONS values above).
export function slugifyCarMake(make: string): string {
  return make
    .toLowerCase()
    .replace(/š/g, 's')
    .replace(/ë/g, 'e')
    .replace(/\s+/g, '-');
}

export interface AdjustedCarBenchmark extends PriceRange {
  brandTier: CarBrandTier;
  source: BenchmarkSource;
}

export function getAdjustedCarBenchmark(
  job: CarJobType,
  carClass: CarBenchmarkClass,
  brandValue: string,
  region: CarRegion
): AdjustedCarBenchmark {
  const base = CAR_BENCHMARKS[job][carClass];
  const brandTier = getCarBrandTier(brandValue);
  const multiplier =
    CAR_BRAND_TIER_MULTIPLIER[brandTier] * CAR_REGION_MULTIPLIER[region] * INFLATION_MULTIPLIER_SINCE_RESEARCH;

  return {
    low: Math.round(base.low * multiplier),
    high: Math.round(base.high * multiplier),
    brandTier,
    source: base.source,
  };
}
