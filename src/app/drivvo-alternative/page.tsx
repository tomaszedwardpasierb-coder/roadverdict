// Place at: src/app/drivvo-alternative/page.tsx
//
// Comparison page for UK drivers and riders searching for an alternative to
// the big global logbook apps (Drivvo, Fuelio). The honest difference is the
// UK data: neither app's own feature list mentions MOT history or road tax,
// and RoadVerdict brings both in by registration. There's no importer for
// their export files yet, and the page says so. Facts about Drivvo and
// Fuelio come from their own websites on CHECKED.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import styles from '@/components/seo/PriceGuide.module.css';

const CHECKED = '9 October 2026';

export const metadata: Metadata = pageMetadata({
  title: 'Drivvo & Fuelio Alternative for UK Drivers and Riders',
  description:
    'A vehicle logbook built for the UK: MOT history and road tax by registration, receipts read for you, and UK prices for repairs. For cars and motorcycles.',
  path: '/drivvo-alternative',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Drivvo & Fuelio alternative', '/drivvo-alternative');

const ROWS: { what: string; global: string; rv: string }[] = [
  { what: 'Fuel log and MPG', global: 'Yes', rv: 'Yes' },
  { what: 'Services, repairs and other costs', global: 'Yes', rv: 'Yes' },
  { what: 'Service reminders', global: 'Yes', rv: 'Yes - by date or mileage' },
  { what: 'UK MOT history, brought in by registration', global: 'Not listed', rv: 'Yes' },
  { what: 'Road tax status from the DVLA record', global: 'Not listed', rv: 'Yes' },
  { what: 'Receipts read for you from a photo', global: 'Not listed', rv: 'Yes' },
  { what: 'Is this garage quote fair? (UK prices)', global: 'Not listed', rv: 'Yes - free quote checker' },
  { what: 'Send a buyer the vehicle’s history', global: 'Not listed', rv: 'Yes - one link' },
  { what: 'Languages', global: 'Many (Drivvo: 60+)', rv: 'English, UK only' },
];

const FAQ = [
  {
    q: 'Can I import my Drivvo or Fuelio history into RoadVerdict?',
    a: 'Not yet - there’s no importer for their export files. What you do get straight away is your vehicle’s MOT history, brought in by registration, which fills in the official mileage at every test. You can then photograph old receipts and they’re read and filed for you.',
  },
  {
    q: 'Why does the MOT history matter in a logbook?',
    a: 'It’s the official record of every test: the result, the mileage and every advisory. With it next to your own records you can see what the tester flagged, whether it was fixed and what it cost - and a buyer can check it against the same official data.',
  },
  {
    q: 'Does RoadVerdict work for motorcycles?',
    a: 'Yes. Motorcycles and cars are both first-class, with bike jobs like chain and sprockets, tyres and valve clearance checks, and separate motorcycle prices in the quote checker.',
  },
  {
    q: 'Is RoadVerdict free?',
    a: 'Yes, for one vehicle, with no ads. Exporting your full history is free on every plan. Pro adds a second vehicle, exact reminder dates and emails, reports and more.',
  },
  {
    q: 'Is RoadVerdict connected to Drivvo or Fuelio?',
    a: 'No. RoadVerdict is independent and has no connection with Drivvo or Fuelio (Sygic). The details about them on this page come from their own websites.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function DrivvoAlternativePage() {
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
      <h1>A Drivvo and Fuelio Alternative Built for the UK</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Drivvo and Fuelio are good, popular apps for logging fuel and costs, used by millions of
        drivers around the world. Because they&apos;re built for every country, they don&apos;t know
        about the things UK drivers and riders deal with: the MOT, its advisories, and road tax.
        RoadVerdict is a logbook for cars and motorcycles in the UK, and it starts from that official
        data.
      </p>

      <h2>Global logbook apps vs RoadVerdict</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">What you want to do</th>
              <th scope="col">Drivvo / Fuelio</th>
              <th scope="col">RoadVerdict</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.what}>
                <td>{r.what}</td>
                <td>{r.global}</td>
                <td>{r.rv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ maxWidth: 'none' }}>
        Drivvo and Fuelio details from their own websites, checked on {CHECKED}. &quot;Not listed&quot;
        means it wasn&apos;t in either app&apos;s published feature list that day.
      </p>

      <h2>Where Drivvo and Fuelio are the better choice</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>You live outside the UK,</strong> or want the app in another language.
        </li>
        <li>
          <strong>You mainly want fuel prices.</strong> Fuelio shows fuel prices reported by its users.
        </li>
        <li>
          <strong>You already have years of entries there.</strong> We can&apos;t import them yet, so
          moving means starting a new log - though the MOT history fills a lot of it in.
        </li>
      </ul>

      <h2>What a UK logbook adds</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>The MOT history, without typing it.</strong> Add the registration and every MOT test
          comes in: the result, the mileage and each advisory. The next MOT date sets itself.
        </li>
        <li>
          <strong>Road tax that keeps itself up to date.</strong> The tax status comes from the DVLA
          record when you add the vehicle and whenever it&apos;s refreshed.
        </li>
        <li>
          <strong>Receipts read for you.</strong> Photograph a garage invoice or a fuel receipt and the
          entries are filled in.
        </li>
        <li>
          <strong>UK prices.</strong> The <Link href="/quote-checker">motorcycle</Link> and{' '}
          <Link href="/cars/quote-checker">car</Link> quote checkers tell you whether a garage&apos;s
          price is fair, using sourced UK prices. See what common jobs cost in the{' '}
          <Link href="/guides">price guides</Link>.
        </li>
        <li>
          <strong>A history you can hand over.</strong> When you sell, send the buyer one link to the
          whole record.
        </li>
        <li>
          <strong>No ads, and your data stays yours.</strong> Exporting your full history is free on
          every plan.
        </li>
      </ul>
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
        Drivvo and Fuelio are trademarks of their owners. RoadVerdict is independent and not
        affiliated with, or endorsed by, either of them.
      </p>
    </div>
  );
}
