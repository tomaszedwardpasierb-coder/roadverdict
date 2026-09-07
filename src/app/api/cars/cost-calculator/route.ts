import { NextRequest, NextResponse } from 'next/server';
import { carCostCalculatorRequestSchema } from '@/lib/validation';
import { computeCarAnnualCost } from '@/lib/carCostCalculator';
import { CAR_BRAND_OPTIONS, CAR_REGION_LABELS } from '@/lib/carPriceData';

export const runtime = 'nodejs';

// Same lightweight limiter as the other car public-tool routes - fine
// for a single free-tier instance, not sufficient once this is a real
// public site at scale.
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

  const parsed = carCostCalculatorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your answers and try again.' },
      { status: 400 }
    );
  }

  const { carClass, brand, region, fuelType, annualMileage, co2Gkm } = parsed.data;

  // No try/catch around computeCarAnnualCost - same deliberate "let it
  // propagate" convention the motorcycle cost-calculator route already
  // uses for a failed fuel-price fetch. This also covers the
  // electric-car rejection thrown inside computeCarAnnualCost itself,
  // though the client shouldn't be able to reach that path at all - the
  // form only offers small/medium/large in its car-size selector.
  const breakdown = await computeCarAnnualCost(carClass, brand, region, annualMileage, fuelType, co2Gkm);

  // No logging here yet, same deliberate "not yet" as the motorcycle
  // cost-calculator route.

  const brandLabel = CAR_BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand;
  const regionLabel = CAR_REGION_LABELS[region];

  return NextResponse.json({
    breakdown,
    brandLabel,
    regionLabel,
  });
}
