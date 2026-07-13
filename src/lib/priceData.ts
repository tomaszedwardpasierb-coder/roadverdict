/**
 * BENCHMARK DATA — sourced, but still thin. Read this before trusting it.
 * ------------------------------------------------------------------------
 * These ranges are now anchored to real UK sources (named specialists' own
 * published price lists, a breakdown-cover advice page, and UK rider forum
 * threads), not invented. But "anchored" isn't the same as "done":
 *
 * - chain-and-sprockets: well anchored. Two independent London motorcycle
 *   specialists (FWR, Two Tyres) publish "from" prices by engine-size band
 *   for a fitted chain+sprocket kit, and they closely agree with each other
 *   and with UK forum quotes. Numbers below add headroom above their "from"
 *   price for mid/premium kit choices.
 * - brake-pads-front: thinly anchored. One London specialist quotes ~£30 to
 *   supply and fit a pair of pads (one caliper). Extrapolated upward for
 *   bikes with twin front discs (large class). Only one real source — needs
 *   more before you'd call this solid.
 * - basic-service / full-service: anchored to a breakdown-cover site's
 *   published guide, banded by engine size — but that page is dated
 *   2022-11-10, so treat it as a starting point for inflation-adjustment,
 *   not gospel. basic-service is derived as ~60% of full-service since no
 *   source split the two.
 * - tyres-pair: weakest of the five. Only the small-bike figure has a real
 *   anchor (a named specialist's 125cc budget tyre-pair price, plus typical
 *   fitting labour). Medium/large are extrapolated from general knowledge
 *   of how tyre unit cost scales with size, not from a source that actually
 *   quoted those bikes. Prioritise re-checking this one first.
 *
 * Brand-tier and region multipliers below are STILL estimates, not sourced —
 * that research hasn't happened yet.
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

// Brand TIER, not brand+model — full model-level pricing needs real per-model
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

// PLACEHOLDER multipliers — same caveat as BENCHMARKS below. Directionally
// reasonable (premium brands and London/SE labour cost more) but not sourced
// from real rate cards yet.
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

type BenchmarkTable = Record<JobType, Record<BikeClass, PriceRange>>;

export const BENCHMARKS: BenchmarkTable = {
  'basic-service': {
    small: { low: 55, high: 95 },
    medium: { low: 95, high: 145 },
    large: { low: 125, high: 195 },
  },
  'full-service': {
    small: { low: 85, high: 150 },
    medium: { low: 150, high: 220 },
    large: { low: 190, high: 300 },
  },
  'tyres-pair': {
    small: { low: 150, high: 190 },
    medium: { low: 220, high: 300 },
    large: { low: 280, high: 380 },
  },
  'brake-pads-front': {
    small: { low: 30, high: 55 },
    medium: { low: 45, high: 75 },
    large: { low: 60, high: 100 },
  },
  'chain-and-sprockets': {
    small: { low: 120, high: 160 },
    medium: { low: 140, high: 190 },
    large: { low: 160, high: 230 },
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
  medium: 'Medium (401–750cc)',
  large: 'Large (751cc+)',
};

export function getBenchmark(job: JobType, bikeClass: BikeClass): PriceRange {
  return BENCHMARKS[job][bikeClass];
}

export function getBrandTier(brandValue: string): BrandTier {
  return BRAND_OPTIONS.find((b) => b.value === brandValue)?.tier ?? 'mainstream';
}

export interface AdjustedBenchmark extends PriceRange {
  brandTier: BrandTier;
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
  };
}
