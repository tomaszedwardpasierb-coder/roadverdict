// Place at: src/app/track/page.tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Free Motorcycle Maintenance & Fuel Tracker | RoadVerdict',
  description:
    'Log services, fuel, modifications, and running costs for your motorcycle - free, with reminders and real UK price checks. No password, just your email.',
};

export default async function TrackLandingPage() {
  const session = await getSession();
  if (session) redirect('/dashboard');

  return (
    <div className="hero">
      <h1>Know exactly what your bike costs you</h1>
      <p style={{ maxWidth: 'none', margin: '0 0 1.5rem' }}>
        Log every service, fill-up, and modification - free, for as long as you own the
        bike. Sign in with just your email, no password to remember.
      </p>
      <p style={{ marginBottom: '2.5rem' }}>
        <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block' }}>
          Start tracking free
        </Link>
      </p>

      <h2>Sound familiar?</h2>
      <div className="problem-grid">
        <div className="info-card">
          <h3>No idea what fuel really costs</h3>
          <p>You fill up, pay, and forget. No record of what it actually costs you per month, or what your bike really does per gallon.</p>
        </div>
        <div className="info-card">
          <h3>Lost receipts, forgotten services</h3>
          <p>Work gets done, receipts get binned. Six months later you can&apos;t remember what was actually done, or when.</p>
        </div>
        <div className="info-card">
          <h3>Reminders live in your head</h3>
          <p>Until something breaks and you wish you&apos;d remembered sooner. Chains, brake fluid, valve clearances - easy to lose track of.</p>
        </div>
        <div className="info-card">
          <h3>No real picture of the cost</h3>
          <p>Servicing, fuel, insurance, tax, mods - add it all up and most riders genuinely don&apos;t know what a bike costs them a year.</p>
        </div>
        <div className="info-card">
          <h3>Mods and bills, scattered everywhere</h3>
          <p>Insurance renewal in one place, an MOT reminder in your calendar, a mod receipt buried in an email somewhere - nothing lives together.</p>
        </div>
        <div className="info-card">
          <h3>Nothing to show when you sell</h3>
          <p>Full service history adds real value to a used bike - but only if you can actually produce it, not just remember it existed.</p>
        </div>
      </div>

      <h2>One place for all of it</h2>
      <div className="feature-grid">
        <div className="info-card">
          <h3>Service log</h3>
          <p>17 job types from oil changes to valve clearances. The five most common jobs get checked against the same real UK price data as our Quote Checker.</p>
        </div>
        <div className="info-card">
          <h3>Parts & Accessories</h3>
          <p>Exhausts, tank pads, crash protection, custom work - tracked separately from maintenance, since it&apos;s spend, not upkeep.</p>
        </div>
        <div className="info-card">
          <h3>Real fuel economy</h3>
          <p>Log fill-ups and we calculate your bike&apos;s actual MPG from real data - not a generic assumption.</p>
        </div>
        <div className="info-card">
          <h3>Insurance, tax & MOT</h3>
          <p>Logged as real payments, with renewal reminders offered automatically.</p>
        </div>
        <div className="info-card">
          <h3>Reminders that fit how you think</h3>
          <p>By mileage, by time, or an exact date - whichever makes sense for the job.</p>
        </div>
        <div className="info-card">
          <h3>Annual budget</h3>
          <p>Set a number for the year. We&apos;ll tell you plainly if you go over it.</p>
        </div>
      </div>

      <h2>Why RoadVerdict&apos;s tracker</h2>
      <div className="benefit-grid">
        <div className="info-card">
          <h3>Checked against real UK prices</h3>
          <p>The only tracker that compares what you actually paid against real UK motorcycle service prices.</p>
        </div>
        <div className="info-card">
          <h3>Built for UK motorcycles specifically</h3>
          <p>Not a car app with a motorbike icon bolted on. Job types, intervals, and prices all reflect actual bikes.</p>
        </div>
        <div className="info-card">
          <h3>Genuinely free</h3>
          <p>No premium tier, no paywall on features. Free the same way the rest of RoadVerdict is free.</p>
        </div>
      </div>

      <h2>Get started in a minute</h2>
      <ol className="steps-list">
        <li>
          <strong>Sign in with your email</strong>
          <p>We send a magic link - click it, you&apos;re in. No password to create.</p>
        </li>
        <li>
          <strong>Add your bike</strong>
          <p>Make, model, year, current mileage. Takes under a minute.</p>
        </li>
        <li>
          <strong>Start logging</strong>
          <p>Reports, charts, and reminders take care of themselves from there.</p>
        </li>
      </ol>

      <div className="tracker-cta">
        <h2>Start tracking your bike, free</h2>
        <p style={{ maxWidth: 'none', margin: '0 auto' }}>No credit card, no premium tier, no catch.</p>
        <Link href="/login" className="btn-primary" style={{ textDecoration: 'none', display: 'inline-block', marginTop: '0.5rem' }}>
          Start tracking free
        </Link>
      </div>
    </div>
  );
}



