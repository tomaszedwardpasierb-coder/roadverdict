import { NextRequest, NextResponse } from 'next/server';
import { carBuyingGuideRequestSchema } from '@/lib/validation';
import { CAR_CHECKLISTS, CAR_AGE_BAND_LABELS, CAR_SIZE_CLASS_ADDENDUM, CAR_BRAND_SPECIFIC_NOTES, CAR_CLASS_LABELS_FOR_BUYING_GUIDE } from '@/lib/tracker/carBuyerChecklist';
import { CAR_BRAND_OPTIONS } from '@/lib/carPriceData';
import { logCarBuyingGuideCheck } from '@/lib/db';

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

  const parsed = carBuyingGuideRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Please check your answers and try again.' },
      { status: 400 }
    );
  }

  const { carClass, brand, ageBand } = parsed.data;

  // Anonymised by design, same as the other two car tools - car class,
  // brand, age band, nothing that identifies the person checking it.
  logCarBuyingGuideCheck({ carClass, brand, ageBand });

  return NextResponse.json({
    checklist: CAR_CHECKLISTS[ageBand],
    addendum: CAR_SIZE_CLASS_ADDENDUM[carClass],
    brandNotes: CAR_BRAND_SPECIFIC_NOTES[brand] ?? null,
    ageBandLabel: CAR_AGE_BAND_LABELS[ageBand],
    carClassLabel: CAR_CLASS_LABELS_FOR_BUYING_GUIDE[carClass],
    brandLabel: CAR_BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand,
  });
}
