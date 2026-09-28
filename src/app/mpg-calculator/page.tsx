import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { MpgCalculator } from '@/components/MpgCalculator';
import { mpgToL100km } from '@/lib/fuelEconomy';
import { LogFuelCta } from './LogFuelCta';
import styles from './page.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'MPG Calculator UK - Miles per Gallon and L/100km',
  description:
    'Work out your real fuel economy from one tank, in UK miles per gallon or litres per 100 km, and what every mile costs you at this week’s UK fuel price. Free, for cars and motorcycles.',
  path: '/mpg-calculator',
});

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'RoadVerdict MPG calculator',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Any',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
  description:
    'Calculate fuel economy from one tank in UK miles per gallon or litres per 100 km, and the fuel cost per mile, for cars and motorcycles.',
};

const breadcrumbJsonLd = buildBreadcrumbJsonLd('MPG Calculator', '/mpg-calculator');

// Worked out, not quoted - the same formula the calculator uses.
const CONVERSIONS = [30, 40, 50, 60, 70, 80].map((mpg) => ({ mpg, l100km: mpgToL100km(mpg).toFixed(1) }));

// Static on purpose, like the other tool pages: the calculator runs in the
// browser, this week's UK fuel price arrives from /api/fuel-price after
// load, and a signed-in visitor's call to action is resolved client-side
// (LogFuelCta). The JSON-LD blocks need no CSP nonce: they're data.
export default function MpgCalculatorPage() {
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
      <div className="hero">
        <h1>MPG calculator</h1>
        <p>Your real fuel economy from one tank - in UK miles per gallon or litres per 100 km - and what every mile costs you.</p>
      </div>

      <MpgCalculator variant="page" />

      <LogFuelCta />

      <div className={styles.content}>
        <section aria-labelledby="measure">
          <h2 id="measure">How to measure your real MPG</h2>
          <ol className={styles.steps}>
            <li>Fill the tank to the brim - until the pump clicks off - and reset your trip meter.</li>
            <li>Drive as you normally would. The more miles before the next fill, the truer the figure.</li>
            <li>Fill to the brim again, at the same pump if you can, and note how many litres it takes.</li>
            <li>Enter the trip reading and those litres above. That&apos;s your real MPG for that tank.</li>
          </ol>
          <p>
            The economy readout on your dashboard is the vehicle&apos;s own estimate. Brim to brim measures what actually went in -
            which is also how RoadVerdict works out the average from your logged fill-ups.
          </p>
        </section>

        <section aria-labelledby="uk-us">
          <h2 id="uk-us">UK MPG and US MPG aren&apos;t the same</h2>
          <p>
            A UK gallon is 4.546 litres; a US gallon is 3.785. The same tank therefore gives a number about a fifth higher in UK
            MPG. If a figure you&apos;ve read online looks disappointing, check which gallon it uses: 40 US mpg is 48 UK mpg. The
            calculator shows both.
          </p>
        </section>

        <section aria-labelledby="convert">
          <h2 id="convert">Converting MPG and litres per 100 km</h2>
          <p>
            The two run in opposite directions - more miles per gallon is better, fewer litres per 100 km is better - so one
            isn&apos;t a fixed multiple of the other. To convert either way, divide 282.5 by the number you have.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">MPG (UK)</th>
                <th scope="col">L/100km</th>
              </tr>
            </thead>
            <tbody>
              {CONVERSIONS.map((row) => (
                <tr key={row.mpg}>
                  <td>{row.mpg}</td>
                  <td>{row.l100km}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section aria-labelledby="official">
          <h2 id="official">Why yours won&apos;t match the official figure</h2>
          <p>
            Official figures come from a standard laboratory test, which makes them a fair way to compare one model with another.
            What you actually get depends on your roads, your speed, the load you carry, the weather and how often the engine
            starts from cold - so your own brim-to-brim figure is the one to budget with.
          </p>
        </section>
      </div>

      <nav className="rv-related-tools" aria-label="Other free tools">
        <p className="rv-related-tools__eyebrow">Also free</p>
        <div className="rv-related-tools__row">
          <Link href="/cost-calculator" className="rv-related-tools__link">
            <strong>Motorcycle Cost Calculator</strong>
            <span>What a bike costs you a year, fuel included</span>
          </Link>
          <Link href="/cars/cost-calculator" className="rv-related-tools__link">
            <strong>Car Cost Calculator</strong>
            <span>What a car costs you a year, fuel included</span>
          </Link>
          <Link href="/guides" className="rv-related-tools__link">
            <strong>Guides &amp; Prices</strong>
            <span>What common jobs cost, and what to check</span>
          </Link>
        </div>
        <p className="rv-related-tools__switch">
          Been quoted for a job? <Link href="/quote-checker">Check a motorcycle quote</Link> or{' '}
          <Link href="/cars/quote-checker">a car quote</Link>.
        </p>
      </nav>
    </>
  );
}
