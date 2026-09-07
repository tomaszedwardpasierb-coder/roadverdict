// Place at: src/app/cars/page.tsx
//
// Public, signed-out marketing landing page for car support - the /cars
// namespace from RoadVerdict_Car_Plan_v3.md's Phase 4. Reuses the
// homepage's rv-* design system (same dark hero, same amber accent) but
// deliberately without the homepage's comic-panel photography, since
// there's no car-specific hero imagery to show - a text-led hero is
// honest about that rather than reusing motorcycle photos on a car page.
//
// Links to /cars/quote-checker, /cars/cost-calculator, and
// /cars/buying-guide - the car equivalents of the motorcycle tools,
// built once Phase 7's real UK car price research landed (see
// carPriceData.ts). Never links to the motorcycle-only /quote-checker,
// /cost-calculator, or /buying-guide - those are benchmarked against
// motorcycle price data only and would overclaim if presented as
// available for cars.
import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { getCarsForUser } from '@/lib/tracker/car';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Know what your car really costs',
  description:
    'Log every service, fuel fill, and bill for your car - petrol, diesel, hybrid, or electric. Scan receipts with AI and get reminders before your MOT or insurance lapses. Free to start.',
  alternates: { canonical: '/cars' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict for cars',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'GBP',
  },
  description:
    'Car ownership tracker for UK drivers - service history, fuel logs, bills, and MOT/insurance reminders, with AI receipt scanning.',
};

const FEATURES = [
  {
    title: 'Service history',
    body: "Log every service and repair - oil changes, brakes, tyres, and more. Free-text make and model, so there's no curated list to fight with.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    ),
  },
  {
    title: 'Fuel log',
    body: 'Petrol, diesel, hybrid, plug-in hybrid, or fully electric. Litres or kWh - whichever your car actually uses.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M3 22h10M14 9h3l3 3v6a1 1 0 0 1-1 1h-1"/><path d="M14 13h4"/><circle cx="7" cy="6" r="1"/></svg>
    ),
  },
  {
    title: 'Bills & MOT',
    body: 'Track mods, insurance, tax, finance, and MOT - including ULEZ and congestion charges, which most trackers ignore entirely.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.2L4 3a1 1 0 0 0-1 1l.2 5.59a2 2 0 0 0 .61 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.37-4.37a2 2 0 0 0 0-2.83Z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>
    ),
  },
  {
    title: 'Reminders that fire early',
    body: "Mileage or date-based reminders for services, MOT, and insurance renewal - before it's overdue, not after.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
    ),
  },
  {
    title: 'Receipt scanning',
    body: 'Photograph a receipt and let AI read the job, cost, and date straight into your log - nothing to type out by hand.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
    ),
  },
] as const;

export default async function CarsPage() {
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  // Same defensive wrapping as the existing public tool pages: a Cosmos
  // problem should degrade this to "treat as anonymous," not take down a
  // public, no-account-needed marketing page for every visitor.
  let session: Awaited<ReturnType<typeof getSession>> = null;
  try {
    session = await getSession();
  } catch (err) {
    console.error('Cars page: getSession() failed, continuing as anonymous:', err);
  }
  const hasCar = session ? (await getCarsForUser(session.email).catch(() => [])).length > 0 : false;

  const ctaHref = !session ? `/login?redirect=${encodeURIComponent('/dashboard?addVehicle=car')}` : hasCar ? '/dashboard' : '/dashboard?addVehicle=car';
  const ctaLabel = !session ? 'Start tracking your car free' : hasCar ? 'Go to your dashboard' : 'Add your car';

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="rv-hero" aria-label="Hero">
        <div className="rv-hero-content">
          <div className="rv-hero-eyebrow">
            <span className="rv-eyebrow-dot" aria-hidden="true" />
            Cars · UK
          </div>
          <h1 className="rv-hero-headline">
            Know what<br />
            your car<br />
            <span className="rv-hl-amber">really costs.</span>
          </h1>
          <p className="rv-hero-sub">
            Log every service, fuel fill, and bill.{' '}
            <strong>Scan receipts with your camera - AI reads them.</strong>{' '}
            Reminders fire before your MOT or insurance lapses, not after.
          </p>
          <div className="rv-hero-actions">
            <Link href={ctaHref} className="rv-cta-primary">
              {ctaLabel}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4"/></svg>
            </Link>
            <Link href="/" className="rv-cta-secondary">Ride a motorcycle instead?</Link>
          </div>
          <ul className="rv-hero-proof" aria-label="Key facts">
            <li className="rv-proof-item">
              <span className="rv-proof-check" aria-hidden="true">✓</span>
              No password - email only
            </li>
            <li className="rv-proof-item">
              <span className="rv-proof-check" aria-hidden="true">✓</span>
              Free to start
            </li>
            <li className="rv-proof-item">
              <span className="rv-proof-check" aria-hidden="true">✓</span>
              AI reads your receipts
            </li>
          </ul>
        </div>
      </section>

      {/* ── DIAGONAL CUT ─────────────────────────────────────────────── */}
      <div className="rv-cut" aria-hidden="true" />

      {/* ── FEATURES ─────────────────────────────────────────────────── */}
      <section className="rv-problems" aria-labelledby="features-heading">
        <p className="rv-section-eyebrow">What you can do today</p>
        <h2 className="rv-section-heading" id="features-heading">
          Every car has a story. Start logging yours.
        </h2>
        <p className="rv-section-sub">
          The same engine that&apos;s tracked thousands of motorcycles, now built for cars too.
        </p>
        <div className="rv-problem-grid">
          {FEATURES.map((f, i) => (
            <div className="rv-problem-card" key={f.title}>
              <div className="rv-problem-num" aria-hidden="true">{String(i + 1).padStart(2, '0')}</div>
              <h3 className="rv-problem-title">{f.title}</h3>
              <p className="rv-problem-body">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FREE TOOLS ───────────────────────────────────────────────── */}
      <section className="rv-problems" aria-labelledby="tools-heading">
        <p className="rv-section-eyebrow">Also free</p>
        <h2 className="rv-section-heading" id="tools-heading">
          Benchmarked against real UK car prices
        </h2>
        <p className="rv-section-sub">
          Not just for cars you&apos;re logging - for any car you&apos;re quoted on, running, or
          about to buy.
        </p>
        <div className="rv-related-tools__row">
          <Link href="/cars/quote-checker" className="rv-related-tools__link">
            <strong>Quote Checker</strong>
            <span>Is your service quote fair?</span>
          </Link>
          <Link href="/cars/cost-calculator" className="rv-related-tools__link">
            <strong>Cost Calculator</strong>
            <span>What does it actually cost you a year?</span>
          </Link>
          <Link href="/cars/buying-guide" className="rv-related-tools__link">
            <strong>Buying Guide</strong>
            <span>What to check before you buy</span>
          </Link>
        </div>
      </section>

      {/* ── VERDICT PANEL ────────────────────────────────────────────── */}
      <section className="rv-verdict-strip" aria-labelledby="verdict-cta-heading">
        <div className="rv-verdict-content">
          <h2 className="rv-verdict-heading" id="verdict-cta-heading">
            The verdict is in.
          </h2>
          <p className="rv-verdict-p">
            Free to start. No password. Everything you log is yours - export it any time.
          </p>
          <Link href={ctaHref} className="rv-cta-dark">
            {ctaLabel}
          </Link>
        </div>
      </section>
    </>
  );
}
