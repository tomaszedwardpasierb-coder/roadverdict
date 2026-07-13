import { NextRequest, NextResponse } from 'next/server';
import { buyingGuideRequestSchema } from '@/lib/validation';
import { CHECKLISTS, AGE_BAND_LABELS, BIKE_CLASS_ADDENDUM, BRAND_SPECIFIC_NOTES } from '@/lib/buyerChecklist';
import { BRAND_OPTIONS, BIKE_CLASS_LABELS } from '@/lib/priceData';
import { logBuyingGuideCheck } from '@/lib/db';

export const runtime = 'nodejs';

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

  const parsed = buyingGuideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your answers and try again.' },
      { status: 400 }
    );
  }

  const { bikeClass, brand, ageBand } = parsed.data;

  // Anonymised by design, same as the other two tools — bike class, brand,
  // age band, nothing that identifies the person checking it.
  logBuyingGuideCheck({ bikeClass, brand, ageBand });

  return NextResponse.json({
    checklist: CHECKLISTS[ageBand],
    addendum: BIKE_CLASS_ADDENDUM[bikeClass],
    brandNotes: BRAND_SPECIFIC_NOTES[brand] ?? null,
    ageBandLabel: AGE_BAND_LABELS[ageBand],
    bikeClassLabel: BIKE_CLASS_LABELS[bikeClass],
    brandLabel: BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand,
  });
}
