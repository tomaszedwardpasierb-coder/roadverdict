import { NextRequest, NextResponse } from 'next/server';
import { quoteRequestSchema } from '@/lib/validation';
import { getAdjustedBenchmark, REGION_LABELS, BRAND_OPTIONS, JOB_LABELS, BIKE_CLASS_LABELS } from '@/lib/priceData';
import { computeVerdict, VERDICT_LABELS } from '@/lib/verdict';
import { logQuoteCheck, getCommunityStats } from '@/lib/db';
import { generateQuoteAdvice } from '@/lib/tracker/quoteAdvice';

// better-sqlite3 needs the Node.js runtime, not the Edge runtime.
export const runtime = 'nodejs';

// A simple in-memory limiter. This resets whenever the app restarts and won't
// work across multiple instances — fine for a single free-tier prototype, NOT
// sufficient once this is a real public site. Replace with a shared store
// (e.g. Azure Cache for Redis, or a database-backed limiter) before launch.
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

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Generic message to the client — no schema internals leaked. Full detail
    // stays server-side if you add logging here later.
    return NextResponse.json(
      { error: 'Please check your answers and try again.' },
      { status: 400 }
    );
  }

  const { bikeClass, jobType, brand, region, quotedPrice } = parsed.data;
  const adjusted = getAdjustedBenchmark(jobType, bikeClass, brand, region);
  const verdict = computeVerdict(quotedPrice, adjusted);

  // Anonymised by design: job type, bike size band, brand, region, price, verdict —
  // nothing that identifies the person who submitted it.
  logQuoteCheck({ jobType, bikeClass, quotedPrice, verdict, brand, region });

  // Real submitted quotes, shown separately from the verdict above — see the
  // comment in db.ts for why this isn't used to calculate the verdict itself.
  const communityStats = getCommunityStats(jobType, bikeClass);

  // Additive only - the verdict stamp above already works standalone, so a
  // missing GEMINI_API_KEY or a failed call just means this section stays
  // empty rather than the whole response failing.
  const geminiKey = process.env.GEMINI_API_KEY;
  const advice = geminiKey
    ? await generateQuoteAdvice(
        {
          jobLabel: JOB_LABELS[jobType],
          bikeClassLabel: BIKE_CLASS_LABELS[bikeClass],
          brandLabel: BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand,
          brandTier: adjusted.brandTier,
          regionLabel: REGION_LABELS[region],
          quotedPrice,
          range: { low: adjusted.low, high: adjusted.high },
          verdictLabel: VERDICT_LABELS[verdict],
          sourceConfidence: adjusted.source.confidence,
          sourceNote: adjusted.source.note,
          communityStats,
        },
        geminiKey
      )
    : null;

  return NextResponse.json({
    verdict,
    range: { low: adjusted.low, high: adjusted.high },
    brandTier: adjusted.brandTier,
    brandLabel: BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand,
    regionLabel: REGION_LABELS[region],
    communityStats,
    advice,
  });
}
