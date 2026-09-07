import { NextRequest, NextResponse } from 'next/server';
import { carQuoteRequestSchema } from '@/lib/validation';
import { getAdjustedCarBenchmark, CAR_REGION_LABELS, CAR_BRAND_OPTIONS, CAR_JOB_LABELS_BENCHMARKED, CAR_SIZE_CLASS_LABELS } from '@/lib/carPriceData';
import { computeVerdict } from '@/lib/verdict';
import { logCarQuoteCheck, getCarCommunityStats } from '@/lib/db';

// better-sqlite3 needs the Node.js runtime, not the Edge runtime.
export const runtime = 'nodejs';

// Own in-memory limiter, same shape and same caveat as the motorcycle
// verdict route's - not shared state with it (separate Map, separate
// process-lifetime counters), matching the established per-route
// duplication convention rather than a shared limiter module.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const hits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = carQuoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Generic message to the client - no schema internals leaked.
    return NextResponse.json(
      { error: 'Please check your answers and try again.' },
      { status: 400 }
    );
  }

  const { carClass, jobType, brand, region, quotedPrice } = parsed.data;
  const adjusted = getAdjustedCarBenchmark(jobType, carClass, brand, region);
  const verdict = computeVerdict(quotedPrice, adjusted);

  // Anonymised by design: job type, car size band, brand, region, price,
  // verdict - nothing that identifies the person who submitted it.
  logCarQuoteCheck({ jobType, carClass, quotedPrice, verdict, brand, region });

  // Real submitted quotes, shown separately from the verdict above - see
  // the comment in db.ts for why this isn't used to calculate the
  // verdict itself.
  const communityStats = getCarCommunityStats(jobType, carClass);

  return NextResponse.json({
    verdict,
    range: { low: adjusted.low, high: adjusted.high },
    brandTier: adjusted.brandTier,
    brandLabel: CAR_BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand,
    regionLabel: CAR_REGION_LABELS[region],
    jobLabel: CAR_JOB_LABELS_BENCHMARKED[jobType],
    carClassLabel: CAR_SIZE_CLASS_LABELS[carClass],
    communityStats,
  });
}
