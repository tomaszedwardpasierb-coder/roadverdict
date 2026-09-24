// Place at: src/app/motorcycles/page.tsx
//
// Public, signed-out marketing landing page for motorcycle support -
// the missing mirror of /cars/page.tsx. Before this, /cars had a
// dedicated hub consolidating internal links and targeting head terms
// like "car cost tracker," while motorcycle tools sat at bare root paths
// (/quote-checker, /cost-calculator, /buying-guide) with no single page
// doing the same job for "motorcycle" - flagged as a real architecture
// gap in SEO_STRATEGY.md's Pillar 4 (motorcycles as a first-class vehicle
// type, not a footnote) since it's the one structural advantage most
// competitors can't easily copy. Deliberately mirrors /cars/page.tsx's
// structure and design system (same rv-* classes) rather than reusing the
// homepage's own comic-panel hero, which is already motorcycle-branded in
// a way this page shouldn't duplicate.
import type { Metadata } from 'next';
import Link from 'next/link';
import { ViewerCtaLink, ViewerSwitchKindLink } from '@/components/viewer/ViewerCta';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';

export const metadata: Metadata = {
  title: 'Know what your motorcycle really costs',
  description:
    'Log every service, fuel fill, and bill for your motorcycle. Scan receipts with AI and get reminders before your MOT or insurance lapses. Free to start.',
  alternates: { canonical: '/motorcycles' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict for motorcycles',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'GBP',
  },
  description:
    'Motorcycle ownership tracker for UK riders - service history, fuel logs, bills, and MOT/insurance reminders, with AI receipt scanning.',
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Motorcycles', '/motorcycles');

// Bills copy deliberately says "fines and tolls" rather than the car
// page's "ULEZ and congestion charges" - motorcycles are exempt from
// London's congestion charge and the ULEZ/CAZ charges that specific
// wording refers to (see carTollTypes.ts/tollTypes.ts's own split), so
// repeating the car page's claim here would overstate what actually
// applies to a bike.
const FEATURES = [
  {
    title: 'Service history',
    body: "Log every service and repair - oil changes, chain & sprockets, tyres, and more. Free-text make and model, so there's no curated list to fight with.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    ),
  },
  {
    title: 'Fuel log',
    body: 'Petrol or fully electric - litres or kWh, whichever your bike actually uses, plus your real-world MPG once you\'ve logged a few fill-ups.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 22V4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v18M3 22h10M14 9h3l3 3v6a1 1 0 0 1-1 1h-1"/><path d="M14 13h4"/><circle cx="7" cy="6" r="1"/></svg>
    ),
  },
  {
    title: 'Bills, fines & tolls',
    body: 'Track mods, insurance, tax, finance, and MOT - plus fines and tolls, which most trackers ignore entirely.',
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

// Static on purpose - see middleware.ts's CACHEABLE_PUBLIC_PATHS. The
// signed-in variants of the CTAs (label and destination) are resolved
// client-side by ViewerCtaLink; the server-rendered HTML is the signed-out
// version every anonymous visitor and search crawler sees. The JSON-LD
// blocks need no CSP nonce: they're data, never executed.
export default function MotorcyclesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section className="rv-hero" aria-label="Hero">
        <div className="rv-hero-content">
          <div className="rv-hero-eyebrow">
            <span className="rv-eyebrow-dot" aria-hidden="true" />
            Motorcycles · UK
          </div>
          <h1 className="rv-hero-headline">
            Know what<br />
            your bike<br />
            <span className="rv-hl-amber">really costs.</span>
          </h1>
          <p className="rv-hero-sub">
            Log every service, fuel fill, and bill.{' '}
            <strong>Scan receipts with your camera - AI reads them.</strong>{' '}
            Reminders fire before your MOT or insurance lapses, not after.
          </p>
          <div className="rv-hero-actions">
            <ViewerCtaLink kind="bike" className="rv-cta-primary">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4"/></svg>
            </ViewerCtaLink>
            <ViewerSwitchKindLink target="car" className="rv-cta-secondary">Drive a car instead?</ViewerSwitchKindLink>
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
          Every bike has a story. Start logging yours.
        </h2>
        <p className="rv-section-sub">
          The same engine that&apos;s tracked thousands of cars, built for motorcycles first.
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
          Benchmarked against real UK motorcycle prices
        </h2>
        <p className="rv-section-sub">
          Not just for bikes you&apos;re logging - for any bike you&apos;re quoted on, running, or
          about to buy.
        </p>
        <div className="rv-related-tools__row">
          <Link href="/quote-checker" className="rv-related-tools__link">
            <strong>Quote Checker</strong>
            <span>Is your service quote fair?</span>
          </Link>
          <Link href="/cost-calculator" className="rv-related-tools__link">
            <strong>Cost Calculator</strong>
            <span>What does it actually cost you a year?</span>
          </Link>
          <Link href="/buying-guide" className="rv-related-tools__link">
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
          <ViewerCtaLink kind="bike" className="rv-cta-dark" />
        </div>
      </section>
    </>
  );
}
