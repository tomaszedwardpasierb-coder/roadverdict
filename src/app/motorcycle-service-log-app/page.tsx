// Place at: src/app/motorcycle-service-log-app/page.tsx
//
// A page for the search itself ("motorcycle service log app", "motorbike
// maintenance log"). The competitor research (7 Oct 2026) found no
// motorcycle logbook on Google Play with more than 10k installs, so the
// phrase is winnable - but only with a page that's genuinely about bikes:
// what a rider's log needs that a car log doesn't, then how RoadVerdict
// does each part. No competitor names here.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE } from '@/lib/proPlan';

export const metadata: Metadata = pageMetadata({
  title: 'Motorcycle Service Log App: Your Bike’s Full History (UK)',
  description:
    'Log every motorcycle service, tyre, chain and MOT in one place. Receipts read for you, MOT history by registration, reminders by miles or months. Free.',
  path: '/motorcycle-service-log-app',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Motorcycle service log app', '/motorcycle-service-log-app');

const FAQ = [
  {
    q: 'What should a motorcycle service log include?',
    a: 'For each job: the date, the mileage, what was done, the parts and fluids used, who did it and what it cost - plus the receipt. On a bike, make sure the valve clearance checks, brake fluid changes, chain and sprockets and tyres are all there, because they’re what buyers and mechanics ask about.',
  },
  {
    q: 'Can I log services I do myself?',
    a: 'Yes. Log the job, the mileage and the parts, and photograph the receipts for the oil and parts. An honest owner-serviced history with receipts is worth far more than no history at all.',
  },
  {
    q: 'Does the MOT history count as service history?',
    a: 'No - the MOT checks the bike is roadworthy on the day; it doesn’t service it. But the official mileage at each test backs up the mileages in your log, and the advisories show what needed attention.',
  },
  {
    q: 'Is it free?',
    a: `Yes, for one motorcycle: logging, receipt scanning one at a time, the MOT history, reminder alerts, the quote checker, a shareable history link and CSV export, with no ads. Pro is ${PRO_MONTHLY_PRICE} a month or ${PRO_ANNUAL_PRICE} a year and adds a second vehicle, exact reminder dates and emails, reports and more.`,
  },
  {
    q: 'Does it work for cars too?',
    a: 'Yes. RoadVerdict covers motorcycles and cars, so a household with both keeps everything in one account.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function MotorcycleServiceLogAppPage() {
  return (
    <div className="hero">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <h1>A Motorcycle Service Log That Fills Itself In</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Most vehicle logbook apps are written for cars, with motorcycles squeezed in. A bike&apos;s
        history is different: chains and sprockets wear out, tyres go by age as much as tread, valve
        clearance checks are the expensive service everyone asks about, and plenty of riders do their
        own work. RoadVerdict is a service log built for motorcycles from the start - and for cars too.
      </p>

      <h2>What a motorcycle log needs to keep</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Services at the right interval</strong> - by miles or months, whichever comes first,
          because a bike that sits all winter still needs its oil changed.
        </li>
        <li>
          <strong>Valve clearance checks.</strong> Often the costliest routine service, and the first
          thing a buyer looks for on a sports or adventure bike.
        </li>
        <li>
          <strong>Chain and sprockets</strong> - when they were replaced, and at what mileage.
        </li>
        <li>
          <strong>Tyres</strong> - fitting dates and mileage, front and rear separately.
        </li>
        <li>
          <strong>Brake fluid and coolant changes,</strong> which go by time, not miles.
        </li>
        <li>
          <strong>The MOT history</strong> - every result, mileage and advisory.
        </li>
        <li>
          <strong>Receipts</strong> - garage invoices, and parts receipts for the work you do yourself.
        </li>
      </ul>

      <h2>How RoadVerdict does it</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Add your registration and the MOT history comes in</strong> - every test, mileage and
          advisory - and the next MOT date sets itself. Road tax is read from the DVLA record too.
        </li>
        <li>
          <strong>Photograph a receipt and it&apos;s read for you.</strong> The entries are filled in
          from the invoice: the job, the parts and the cost.
        </li>
        <li>
          <strong>Reminders by miles or months,</strong> for services, MOT, tax, insurance or anything
          else.
        </li>
        <li>
          <strong>Fuel, MPG and running costs,</strong> so you know what the bike really costs per mile.
        </li>
        <li>
          <strong>Is the quote fair?</strong> The <Link href="/quote-checker">motorcycle quote
          checker</Link> compares a garage&apos;s price with sourced UK prices for the same job. See the{' '}
          <Link href="/motorcycles/costs">motorcycle price guides</Link> for what common jobs cost.
        </li>
        <li>
          <strong>Sell with proof.</strong> Send a buyer one link to the bike&apos;s whole history.{' '}
          <Link href="/guides/proving-service-history">What buyers check</Link>
        </li>
        <li>
          <strong>Your records stay yours.</strong> No ads, and exporting your full history is free on
          every plan.
        </li>
      </ul>
      <p style={{ maxWidth: 'none' }}>
        <Link href="/login?redirect=%2Fdashboard">Start a free motorcycle log</Link>
      </p>

      <h2>Buying a used bike?</h2>
      <p style={{ maxWidth: 'none' }}>
        The same records are what to ask a seller for. Our guide covers the paperwork, the checks and
        the questions:{' '}
        <Link href="/guides/buying-a-used-motorcycle">what to check before buying a used motorcycle</Link>.
      </p>

      <h2>Common questions</h2>
      {FAQ.map((f) => (
        <div key={f.q} style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>{f.q}</h3>
          <p style={{ maxWidth: 'none', margin: 0 }}>{f.a}</p>
        </div>
      ))}
    </div>
  );
}
