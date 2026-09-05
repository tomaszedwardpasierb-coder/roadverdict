// Place at: src/app/page.tsx
//
// Formerly the Quote Checker (now at /quote-checker) - this is the
// former /track content, promoted to the homepage. /track itself now
// just redirects here permanently; see src/app/track/page.tsx.
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Know What Your Vehicle Really Costs | RoadVerdict',
  description:
    'Log every service, fill-up, and repair. Check if a quote is fair before you pay. Know exactly what you\'re looking at before you buy. Free for motorcycles and cars.',
  alternates: { canonical: '/' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'GBP',
  },
  description:
    'Vehicle ownership tracker and quote checker for UK drivers and riders. Services, fuel, mods, MOT history, and real UK price benchmarks in one place.',
};

export default async function HomePage() {
  const session = await getSession();
  if (session) redirect('/dashboard');
  const nonce = (await headers()).get('x-nonce') ?? undefined;

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
        {/* Comic panel grid */}
        <div className="rv-hero-panels" aria-hidden="true">
          <div className="rv-panel rv-panel-left">
            <Image
              src="/images/hero/panel-01.png"
              alt=""
              fill
              style={{ objectFit: 'cover', objectPosition: 'center top' }}
              priority
            />
            <div className="rv-panel-overlay" />
            <span className="rv-panel-tag">Panel 01</span>
          </div>
          <div className="rv-panel-right-col">
            <div className="rv-panel rv-panel-rt">
              <Image
                src="/images/hero/panel-02.png"
                alt=""
                fill
                style={{ objectFit: 'cover', objectPosition: 'center center' }}
                priority
              />
              <div className="rv-panel-overlay" />
              <span className="rv-panel-tag">Panel 02</span>
            </div>
            <div className="rv-panel rv-panel-rb">
              <Image
                src="/images/hero/panel-03.png"
                alt=""
                fill
                style={{ objectFit: 'cover', objectPosition: 'center top' }}
              />
              <div className="rv-panel-overlay" />
              <span className="rv-panel-tag">Panel 03</span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="rv-hero-content">
          <div className="rv-hero-eyebrow">
            <span className="rv-eyebrow-dot" aria-hidden="true" />
            Motorcycles &amp; Cars · UK
          </div>
          <h1 className="rv-hero-headline">
            Know what<br />
            your vehicle<br />
            <span className="rv-hl-amber">really costs.</span>
          </h1>
          <p className="rv-hero-sub">
            Log every fill-up, service, and repair.{' '}
            <strong>Check if a quote is fair before you pay.</strong>{' '}
            Know exactly what you&apos;re looking at before you buy.
          </p>
          <div className="rv-hero-actions">
            <Link href="/login" className="rv-cta-primary">
              Start tracking free
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4"/></svg>
            </Link>
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
              Real UK price data
            </li>
          </ul>
        </div>
      </section>

      {/* ── DIAGONAL CUT ─────────────────────────────────────────────── */}
      <div className="rv-cut" aria-hidden="true" />

      {/* ── PROBLEMS ─────────────────────────────────────────────────── */}
      <section className="rv-problems" aria-labelledby="problems-heading">
        <p className="rv-section-eyebrow">Sound familiar?</p>
        <h2 className="rv-section-heading" id="problems-heading">
          Every vehicle owner knows these moments.
        </h2>
        <p className="rv-section-sub">
          The ones that cost you money because you didn&apos;t have the right information.
        </p>
        <div className="rv-problem-grid">
          <div className="rv-problem-card">
            <div className="rv-problem-num" aria-hidden="true">01</div>
            <h3 className="rv-problem-title">The quote you can&apos;t verify</h3>
            <p className="rv-problem-body">Mechanic says £480. Sounds plausible. You pay. Weeks later you find out it should have been £220.</p>
          </div>
          <div className="rv-problem-card">
            <div className="rv-problem-num" aria-hidden="true">02</div>
            <h3 className="rv-problem-title">The receipt you can&apos;t find</h3>
            <p className="rv-problem-body">Work gets done. Receipt gets binned. Six months later: no idea what was done, when, or by whom.</p>
          </div>
          <div className="rv-problem-card">
            <div className="rv-problem-num" aria-hidden="true">03</div>
            <h3 className="rv-problem-title">The cost you never added up</h3>
            <p className="rv-problem-body">Fuel, insurance, tax, tyres, services. Add it all up once and you&apos;ll never ignore it again.</p>
          </div>
          <div className="rv-problem-card">
            <div className="rv-problem-num" aria-hidden="true">04</div>
            <h3 className="rv-problem-title">The buy you&apos;ll regret</h3>
            <p className="rv-problem-body">Seller says &ldquo;immaculate history.&rdquo; The MOT data tells a different story. Only if you know to look.</p>
          </div>
        </div>
      </section>

      {/* ── SOLUTIONS ────────────────────────────────────────────────── */}
      <section className="rv-solutions" aria-labelledby="solutions-heading">
        <p className="rv-section-eyebrow">One place for all of it</p>
        <h2 className="rv-section-heading rv-section-heading--light" id="solutions-heading">
          Built for vehicle owners, not spreadsheets.
        </h2>
        <p className="rv-section-sub rv-section-sub--light">
          Everything in one place. No app to install. Just your email.
        </p>
        <div className="rv-solution-grid">
          <div className="rv-sol-card">
            <div className="rv-sol-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4"/></svg>
            </div>
            <h3 className="rv-sol-title">Quote checker</h3>
            <p className="rv-sol-body">See if your service quote is fair for your vehicle, engine size, and region. Before you agree to anything.</p>
          </div>
          <div className="rv-sol-card">
            <div className="rv-sol-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <h3 className="rv-sol-title">Full history log</h3>
            <p className="rv-sol-body">Services, fuel, mods, insurance, tax - all in one timeline. Scan receipts with your camera. AI reads them.</p>
          </div>
          <div className="rv-sol-card">
            <div className="rv-sol-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </div>
            <h3 className="rv-sol-title">Buying guide</h3>
            <p className="rv-sol-body">Enter a plate or paste a listing. Get a real verdict - buy, negotiate, or walk away - before you hand over money.</p>
          </div>
          <div className="rv-sol-card">
            <div className="rv-sol-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
            </div>
            <h3 className="rv-sol-title">True running cost</h3>
            <p className="rv-sol-body">What does your vehicle actually cost per mile? Per month? Per year? You&apos;ll know exactly.</p>
          </div>
          <div className="rv-sol-card">
            <div className="rv-sol-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            </div>
            <h3 className="rv-sol-title">Sell with proof</h3>
            <p className="rv-sol-body">Share a verified history link with buyers. Full receipts, confirmed mileage. Gets better prices.</p>
          </div>
          <div className="rv-sol-card">
            <div className="rv-sol-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <h3 className="rv-sol-title">Smart reminders</h3>
            <p className="rv-sol-body">MOT, insurance, service intervals. Reminders fire at the right time - not when it&apos;s already overdue.</p>
          </div>
        </div>
      </section>

      {/* ── VERDICT PANEL ────────────────────────────────────────────── */}
      <section className="rv-verdict-strip" aria-labelledby="verdict-cta-heading">
        <div className="rv-verdict-panel-img" aria-hidden="true">
          <Image
            src="/images/hero/panel-04.png"
            alt=""
            fill
            style={{ objectFit: 'cover', objectPosition: 'center center' }}
          />
          <div className="rv-verdict-img-overlay" />
        </div>
        <div className="rv-verdict-content">
          <h2 className="rv-verdict-heading" id="verdict-cta-heading">
            The verdict is in.
          </h2>
          <p className="rv-verdict-p">
            Free to start. No password. Works for motorcycles and cars.<br />
            Your data is yours - export it any time.
          </p>
          <Link href="/login" className="rv-cta-dark">
            Start tracking free - takes 30 seconds
          </Link>
        </div>
      </section>
    </>
  );
}
