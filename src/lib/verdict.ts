import type { PriceRange } from './priceData';

export type Verdict = 'fair' | 'high' | 'second-opinion';

// Tune these once real benchmark data is in — these thresholds were picked to be
// reasonable, not derived from real distribution data.
const HIGH_THRESHOLD = 0.3; // >30% over the top of the typical range

export function computeVerdict(quotedPrice: number, range: PriceRange): Verdict {
  if (quotedPrice <= range.high) return 'fair';

  const overBy = (quotedPrice - range.high) / range.high;
  if (overBy <= HIGH_THRESHOLD) return 'high';
  return 'second-opinion';
}

export const VERDICT_LABELS: Record<Verdict, string> = {
  fair: 'Fair',
  high: 'High',
  'second-opinion': 'Worth a second opinion',
};

export const VERDICT_SUMMARIES: Record<Verdict, string> = {
  fair: 'This is within the typical range for this job on this size of bike.',
  high: "This is above the typical range — not necessarily unfair, but it's worth asking what's included.",
  'second-opinion':
    "This is well above the typical range for this job. Worth getting a second quote before you book it in.",
};
