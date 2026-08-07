import { NextRequest, NextResponse } from 'next/server';
import { costCalculatorRequestSchema } from '@/lib/validation';
import { computeAnnualCost } from '@/lib/costCalculator';
import { BRAND_OPTIONS, REGION_LABELS } from '@/lib/priceData';

export const runtime = 'nodejs';

// Same lightweight limiter as the verdict endpoint - same caveat: fine for a
// single free-tier instance, not sufficient once this is a real public site.
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

  const parsed = costCalculatorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your answers and try again.' },
      { status: 400 }
    );
  }

  const { bikeClass, brand, region, annualMileage } = parsed.data;
  const breakdown = await computeAnnualCost(bikeClass, brand, region, annualMileage);

  // No logging here yet - this endpoint doesn't write to quote_logs. Could add
  // its own anonymised log later the same way the verdict endpoint does, but
  // that's a deliberate "not yet" rather than an oversight.

  return NextResponse.json({
    breakdown,
    brandLabel: BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand,
    regionLabel: REGION_LABELS[region],
  });
}
