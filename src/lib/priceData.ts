/**
 * BENCHMARK DATA - each cell below carries its own source, dates, and
 * confidence. See the source field on each entry rather than a prose
 * block here - that's the single place this now lives, not duplicated.
 */

import { INFLATION_MULTIPLIER_SINCE_RESEARCH } from './inflation';

export type BikeClass = 'small' | 'medium' | 'large';
export type BrandTier = 'budget' | 'mainstream' | 'premium';
export type Region = 'london-se' | 'rest-england-wales' | 'scotland-ni';

export interface BrandOption {
  value: string;
  label: string;
  tier: BrandTier;
}

// Brand TIER, not brand+model - full model-level pricing needs real per-model
// research (the same trap the classic-parts-finder idea hit). Tier captures the
// real signal (a Triumph/BMW service costs more than a Honda/Royal Enfield one)
// without needing hundreds of researched rows.
export const BRAND_OPTIONS: BrandOption[] = [
  { value: 'honda', label: 'Honda', tier: 'mainstream' },
  { value: 'yamaha', label: 'Yamaha', tier: 'mainstream' },
  { value: 'kawasaki', label: 'Kawasaki', tier: 'mainstream' },
  { value: 'suzuki', label: 'Suzuki', tier: 'mainstream' },
  { value: 'ktm', label: 'KTM', tier: 'mainstream' },
  { value: 'triumph', label: 'Triumph', tier: 'premium' },
  { value: 'bmw', label: 'BMW', tier: 'premium' },
  { value: 'ducati', label: 'Ducati', tier: 'premium' },
  { value: 'aprilia', label: 'Aprilia', tier: 'premium' },
  { value: 'harley-davidson', label: 'Harley-Davidson', tier: 'premium' },
  { value: 'royal-enfield', label: 'Royal Enfield', tier: 'budget' },
  { value: 'budget-other', label: 'Other budget/learner brand (Lexmoto, Sinnis, etc.)', tier: 'budget' },
  { value: 'other', label: 'Other / not sure', tier: 'mainstream' },
];

export const REGION_LABELS: Record<Region, string> = {
  'london-se': 'London & South East',
  'rest-england-wales': 'Rest of England & Wales',
  'scotland-ni': 'Scotland & Northern Ireland',
};

// PLACEHOLDER multipliers - directionally reasonable (premium brands and
// London/SE labour cost more) but not sourced from real rate cards yet.
// Not currently used by getInflationAdjustedBenchmark below - see that
// function's own comment for why.
const BRAND_TIER_MULTIPLIER: Record<BrandTier, number> = {
  budget: 0.88,
  mainstream: 1.0,
  premium: 1.25,
};

const REGION_MULTIPLIER: Record<Region, number> = {
  'london-se': 1.15,
  'rest-england-wales': 1.0,
  'scotland-ni': 0.95,
};

export type JobType =
  | 'basic-service'
  | 'full-service'
  | 'tyres-pair'
  | 'brake-pads-front'
  | 'chain-and-sprockets';

export interface PriceRange {
  low: number;
  high: number;
}

export type ConfidenceLevel = 'higher' | 'medium' | 'lower';

export interface BenchmarkSource {
  sourceName: string;
  sourceUrl?: string;
  sourceDate: string;
  lastReviewed: string;
  confidence: ConfidenceLevel;
  note?: string;
}

export interface Benchmark extends PriceRange {
  source: BenchmarkSource;
}

type BenchmarkTable = Record<JobType, Record<BikeClass, Benchmark>>;

export const BENCHMARKS: BenchmarkTable = {
  'basic-service': {
    small: {
      low: 55, high: 95,
      source: {
        sourceName: 'Derived from full-service - no source prices this separately',
        sourceDate: '2022-11-10',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'Computed as roughly 60% of full-service - no source ever split the two directly.',
      },
    },
    medium: {
      low: 95, high: 145,
      source: {
        sourceName: 'Derived from full-service - no source prices this separately',
        sourceDate: '2022-11-10',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'Computed as roughly 60% of full-service - no source ever split the two directly.',
      },
    },
    large: {
      low: 125, high: 195,
      source: {
        sourceName: 'Derived from full-service - no source prices this separately',
        sourceDate: '2022-11-10',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'Computed as roughly 60% of full-service - no source ever split the two directly.',
      },
    },
  },
  'full-service': {
    small: {
      low: 85, high: 150,
      source: {
        sourceName: 'UK breakdown-cover provider - published servicing price guide, banded by engine size',
        sourceDate: '2022-11-10',
        lastReviewed: '2026-07',
        confidence: 'medium',
        note: 'Source page is dated November 2022 - a starting point for inflation adjustment, not current fact on its own.',
      },
    },
    medium: {
      low: 150, high: 220,
      source: {
        sourceName: 'UK breakdown-cover provider - published servicing price guide, banded by engine size',
        sourceDate: '2022-11-10',
        lastReviewed: '2026-07',
        confidence: 'medium',
        note: 'Source page is dated November 2022 - a starting point for inflation adjustment, not current fact on its own.',
      },
    },
    large: {
      low: 190, high: 300,
      source: {
        sourceName: 'UK breakdown-cover provider - published servicing price guide, banded by engine size',
        sourceDate: '2022-11-10',
        lastReviewed: '2026-07',
        confidence: 'medium',
        note: 'Source page is dated November 2022 - a starting point for inflation adjustment, not current fact on its own.',
      },
    },
  },
  'tyres-pair': {
    small: {
      low: 150, high: 190,
      source: {
        sourceName: 'Named UK specialist - 125cc budget tyre-pair price plus typical fitting labour',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'medium',
        note: 'The only one of the three tyres-pair sizes with a real quoted anchor.',
      },
    },
    medium: {
      low: 220, high: 300,
      source: {
        sourceName: 'Extrapolated from the small-bike figure using general knowledge of tyre cost scaling - not a quoted source for this size',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'Weakest of the five job types - prioritise re-checking this against a real source first.',
      },
    },
    large: {
      low: 280, high: 380,
      source: {
        sourceName: 'Extrapolated from the small-bike figure using general knowledge of tyre cost scaling - not a quoted source for this size',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'Weakest of the five job types - prioritise re-checking this against a real source first.',
      },
    },
  },
  'brake-pads-front': {
    small: {
      low: 30, high: 55,
      source: {
        sourceName: 'One London specialist - quoted price to supply and fit a pair of pads (one caliper)',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'medium',
        note: 'Only one real source - needs a second before this is solid.',
      },
    },
    medium: {
      low: 45, high: 75,
      source: {
        sourceName: 'Not clearly stated in the original research notes - between the small (one caliper) and large (twin disc) figures',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'How this specific figure was derived is not documented - flagged lower by default rather than guessed as medium. Worth confirming against a real source.',
      },
    },
    large: {
      low: 60, high: 100,
      source: {
        sourceName: 'Extrapolated upward from the small-bike figure for twin front discs',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'lower',
        note: 'Extrapolated for bikes with twin front discs, not a quoted source for this size.',
      },
    },
  },
  'chain-and-sprockets': {
    small: {
      low: 120, high: 160,
      source: {
        sourceName: 'Two independent London motorcycle specialists - published from-prices by engine-size band, cross-checked against UK rider forum quotes',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'higher',
        note: 'Best-anchored of the five job types - two independent sources that agree with each other and with forum quotes.',
      },
    },
    medium: {
      low: 140, high: 190,
      source: {
        sourceName: 'Two independent London motorcycle specialists - published from-prices by engine-size band, cross-checked against UK rider forum quotes',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'higher',
        note: 'Best-anchored of the five job types - two independent sources that agree with each other and with forum quotes.',
      },
    },
    large: {
      low: 160, high: 230,
      source: {
        sourceName: 'Two independent London motorcycle specialists - published from-prices by engine-size band, cross-checked against UK rider forum quotes',
        sourceDate: '2026-07',
        lastReviewed: '2026-07',
        confidence: 'higher',
        note: 'Best-anchored of the five job types - two independent sources that agree with each other and with forum quotes.',
      },
    },
  },
};

export const JOB_LABELS: Record<JobType, string> = {
  'basic-service': 'Basic service',
  'full-service': 'Full service',
  'tyres-pair': 'Pair of tyres',
  'brake-pads-front': 'Front brake pads',
  'chain-and-sprockets': 'Chain and sprockets',
};

export const BIKE_CLASS_LABELS: Record<BikeClass, string> = {
  small: 'Small (up to 400cc)',
  medium: 'Medium (401-750cc)',
  large: 'Large (751cc+)',
};

export function getBenchmark(job: JobType, bikeClass: BikeClass): Benchmark {
  return BENCHMARKS[job][bikeClass];
}

export function getBrandTier(brandValue: string): BrandTier {
  return BRAND_OPTIONS.find((b) => b.value === brandValue)?.tier ?? 'mainstream';
}

export interface AdjustedBenchmark extends PriceRange {
  brandTier: BrandTier;
  source: BenchmarkSource;
}

export function getAdjustedBenchmark(
  job: JobType,
  bikeClass: BikeClass,
  brandValue: string,
  region: Region
): AdjustedBenchmark {
  const base = BENCHMARKS[job][bikeClass];
  const brandTier = getBrandTier(brandValue);
  const multiplier =
    BRAND_TIER_MULTIPLIER[brandTier] * REGION_MULTIPLIER[region] * INFLATION_MULTIPLIER_SINCE_RESEARCH;

  return {
    low: Math.round(base.low * multiplier),
    high: Math.round(base.high * multiplier),
    brandTier,
    source: base.source,
  };
}

// Inflation-only variant for contexts higher-stakes than the Quote
// Checker's own "does my quote look reasonable" use - the buyer report
// reads to a stranger who might spend real money, and brand/region are
// explicitly unsourced placeholders above, not something that belongs
// baked into a number shown with a confidence label and source notes.
// Inflation is different in kind: a documented correction for a
// disclosed problem (the underlying source data being dated), not a
// guess - see inflation.ts.
export function getInflationAdjustedBenchmark(job: JobType, bikeClass: BikeClass): Benchmark {
  const base = BENCHMARKS[job][bikeClass];
  return {
    low: Math.round(base.low * INFLATION_MULTIPLIER_SINCE_RESEARCH),
    high: Math.round(base.high * INFLATION_MULTIPLIER_SINCE_RESEARCH),
    source: base.source,
  };
}
