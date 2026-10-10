// Place at: src/app/vehicle-smart-alternative/page.tsx
//
// Comparison page for people searching "Vehicle Smart alternative" (the
// pattern Vehicle Score uses for HPI and Total Car Check). Kept honest on
// purpose: Vehicle Smart is the better tool for checking other people's
// vehicles, RoadVerdict for keeping your own vehicle's history - and the page
// says so. Every fact about Vehicle Smart comes from its own website or Play
// listing on VS_CHECKED; re-check them before changing that date.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { PRO_ANNUAL_PRICE, PRO_MONTHLY_PRICE, PRO_TRIAL_DAYS } from '@/lib/proPlan';
import styles from '@/components/seo/PriceGuide.module.css';

const VS_CHECKED = '9 October 2026';

export const metadata: Metadata = pageMetadata({
  title: 'Vehicle Smart Alternative With a Full Service Logbook',
  description:
    'Vehicle Smart is great for checking any car or bike. RoadVerdict keeps your own vehicle’s full history - services, receipts, fuel and costs. An honest comparison.',
  path: '/vehicle-smart-alternative',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Vehicle Smart alternative', '/vehicle-smart-alternative');

const ROWS: { what: string; vs: string; rv: string }[] = [
  {
    what: 'Check any UK vehicle’s MOT and tax status',
    vs: 'Yes, free, any registration',
    rv: 'MOT history free for any registration, with every advisory explained; tax status for your own vehicles',
  },
  {
    what: 'MOT history of your own vehicle',
    vs: 'Yes',
    rv: 'Yes - imported by registration and kept with your records',
  },
  {
    what: 'Service history: what was done, when, at what mileage, and what it cost',
    vs: 'A garage with reminders, not a full service log',
    rv: 'Yes - the core of the app',
  },
  {
    what: 'Receipts read for you',
    vs: 'Not listed',
    rv: 'Yes - photograph a receipt and it’s read and filed',
  },
  {
    what: 'Fuel, MPG and running costs',
    vs: 'Not listed',
    rv: 'Yes',
  },
  {
    what: 'Is this garage quote fair?',
    vs: 'Not listed',
    rv: 'Yes - the free quote checker, using sourced UK prices',
  },
  {
    what: 'Send a buyer your vehicle’s history when you sell',
    vs: 'Not listed',
    rv: 'Yes - one link to the whole history',
  },
  {
    what: 'Paid history checks (finance, stolen, write-off)',
    vs: 'Yes, from a few pounds',
    rv: 'Yes - the full history check',
  },
  {
    what: 'Vehicles on the free plan',
    vs: '3',
    rv: '1',
  },
  {
    what: 'Paid plan',
    vs: '£9.99 a year, or £39.99 once for life',
    rv: `${PRO_MONTHLY_PRICE} a month or ${PRO_ANNUAL_PRICE} a year, ${PRO_TRIAL_DAYS}-day free trial`,
  },
  {
    what: 'Export your own records',
    vs: 'Not listed',
    rv: 'Free on every plan (CSV)',
  },
];

const FAQ = [
  {
    q: 'Is RoadVerdict a replacement for Vehicle Smart?',
    a: 'Not exactly. Vehicle Smart is built for checking vehicles - yours or anyone else’s - and it’s very good at it. RoadVerdict is built for keeping your own motorcycle’s or car’s full history: every service, receipt, fill-up and bill. Plenty of people will want both.',
  },
  {
    q: 'Can I keep my service history in Vehicle Smart?',
    a: 'Vehicle Smart has a garage for your vehicles with reminders, but it isn’t a full service logbook. If you want every job, mileage, receipt and cost in one place - and a history you can hand to a buyer - that’s what RoadVerdict is for.',
  },
  {
    q: 'Does RoadVerdict work for motorcycles?',
    a: 'Yes - motorcycles and cars are both first-class. Bike jobs like chain and sprockets, tyres and valve clearance checks have their own place, and the quote checker has separate motorcycle prices.',
  },
  {
    q: 'Is RoadVerdict free?',
    a: `Yes, for one vehicle: logging, receipt scanning one at a time, the MOT history, reminder alerts, the quote checker, a shareable history link and CSV export. Pro is ${PRO_MONTHLY_PRICE} a month or ${PRO_ANNUAL_PRICE} a year and adds a second vehicle, exact reminder dates and emails, reports, the Vault and a free full history check every 4 weeks.`,
  },
  {
    q: 'Is RoadVerdict connected to Vehicle Smart?',
    a: 'No. RoadVerdict is independent and has no connection with Vehicle Smart Ltd. The details about Vehicle Smart on this page come from its own website and app listing.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function VehicleSmartAlternativePage() {
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
      <h1>Looking for a Vehicle Smart Alternative?</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Vehicle Smart is one of the UK&apos;s most popular car check apps, and it deserves it: type any
        registration and you see the MOT and tax status in seconds. What it isn&apos;t is a logbook. If
        you&apos;re looking for somewhere to keep your own motorcycle&apos;s or car&apos;s full history -
        every service, receipt, fill-up and bill - that&apos;s the gap RoadVerdict fills. Here&apos;s an
        honest side-by-side.
      </p>

      <h2>Vehicle Smart vs RoadVerdict</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">What you want to do</th>
              <th scope="col">Vehicle Smart</th>
              <th scope="col">RoadVerdict</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.what}>
                <td>{r.what}</td>
                <td>{r.vs}</td>
                <td>{r.rv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ maxWidth: 'none' }}>
        Vehicle Smart details from its own website and Google Play listing, checked on {VS_CHECKED}.
        &quot;Not listed&quot; means it wasn&apos;t in Vehicle Smart&apos;s published feature list that
        day. Prices and features change, so check theirs before you decide.
      </p>

      <h2>Where Vehicle Smart is the better choice</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Checking other people&apos;s vehicles, often.</strong> If you look up plates all the
          time - buying, selling, at work - Vehicle Smart is built for exactly that.
        </li>
        <li>
          <strong>Several vehicles on a free plan.</strong> Its free garage holds three; ours holds one.
        </li>
        <li>
          <strong>A cheaper paid plan.</strong> Its Premium is £9.99 a year. RoadVerdict Pro costs more,
          because it does more of the paperwork for you - but if you only want reminders, that&apos;s a
          fair reason to pick Vehicle Smart.
        </li>
      </ul>

      <h2>Where RoadVerdict is the better choice</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>You want the whole history in one place.</strong> Services, repairs, tyres, fuel, mods
          and bills, with the date, mileage and cost of each - and the MOT history alongside.
        </li>
        <li>
          <strong>You want to know what the MOT advisories mean.</strong> The{' '}
          <Link href="/mot-check">free MOT history check</Link> explains every advisory and failure in
          plain English, with what common repairs cost - for any car or motorcycle.
        </li>
        <li>
          <strong>You don&apos;t want to type it all in.</strong> Photograph a receipt and RoadVerdict reads
          it and files the entries for you.
        </li>
        <li>
          <strong>You want to know if a quote is fair.</strong> The{' '}
          <Link href="/quote-checker">motorcycle</Link> and <Link href="/cars/quote-checker">car</Link>{' '}
          quote checkers compare a garage&apos;s price with sourced UK prices for the same job.
        </li>
        <li>
          <strong>You&apos;ll sell one day.</strong> A documented history helps you ask a better price,
          and you can send a buyer one link to all of it.{' '}
          <Link href="/guides/proving-service-history">How buyers check a service history</Link>
        </li>
        <li>
          <strong>You ride.</strong> Motorcycles aren&apos;t an afterthought here: chain and sprockets,
          valve clearance checks and bike service prices all have their own place.
        </li>
        <li>
          <strong>Your records stay yours.</strong> Exporting your full history is free on every plan,
          with no ads.
        </li>
      </ul>

      <h2>Using both</h2>
      <p style={{ maxWidth: 'none' }}>
        They don&apos;t clash. Use Vehicle Smart to check a car or bike before you buy it, then keep its
        history in RoadVerdict once it&apos;s yours - the MOT history comes in by registration, so the
        record starts full.
      </p>
      <p style={{ maxWidth: 'none' }}>
        <Link href="/login?redirect=%2Fdashboard">Start a free logbook</Link>
      </p>

      <h2>Common questions</h2>
      {FAQ.map((f) => (
        <div key={f.q} style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>{f.q}</h3>
          <p style={{ maxWidth: 'none', margin: 0 }}>{f.a}</p>
        </div>
      ))}

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        Vehicle Smart is a trademark of its owner. RoadVerdict is independent and not affiliated with,
        or endorsed by, Vehicle Smart Ltd.
      </p>
    </div>
  );
}
