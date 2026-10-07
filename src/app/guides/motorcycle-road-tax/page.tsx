// Place at: src/app/guides/motorcycle-road-tax/page.tsx
//
// Motorcycle road tax by engine size. Search Console showed about ten
// "how much is motorcycle tax"-style searches landing on pages that don't
// answer them; this one does, from the official GOV.UK rates in
// lib/motorcycleVed.ts (the same figures the running cost calculator uses).
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import Link from 'next/link';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { formatPounds } from '@/lib/seo/priceGuides';
import { MOTORCYCLE_VED_BANDS, MOTORCYCLE_VED_CHECKED, TRICYCLE_VED, vedBand } from '@/lib/motorcycleVed';
import styles from '@/components/seo/PriceGuide.module.css';

const up150 = vedBand('up-to-150');
const mid = vedBand('151-400');
const upper = vedBand('401-600');
const top = vedBand('over-600');

function checkedLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const metadata: Metadata = pageMetadata({
  title: 'Motorcycle Road Tax: Cost by Engine Size (UK)',
  description: `How much is motorcycle road tax? ${formatPounds(up150.twelveMonths)} up to 150cc, ${formatPounds(mid.twelveMonths)} for 151-400cc, ${formatPounds(upper.twelveMonths)} for 401-600cc and ${formatPounds(top.twelveMonths)} over 600cc a year - plus monthly payments, electric bikes and buying used.`,
  path: '/guides/motorcycle-road-tax',
});

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Motorcycle Road Tax', '/guides/motorcycle-road-tax');

const FAQ = [
  {
    q: 'How much is road tax on a 125cc motorcycle?',
    a: `${formatPounds(up150.twelveMonths)} a year - every bike up to 150cc is in the lowest band. Paid by monthly Direct Debit it comes to ${formatPounds(up150.monthlyTotal)} over the year.`,
  },
  {
    q: 'How much is road tax on a 600cc motorcycle?',
    a: `A bike of 600cc or less pays ${formatPounds(upper.twelveMonths)} a year; anything over 600cc pays ${formatPounds(top.twelveMonths)}. Most "600" sports bikes are actually 599cc, so they pay ${formatPounds(upper.twelveMonths)}.`,
  },
  {
    q: 'Do electric motorcycles pay road tax?',
    a: `Yes. Electric (zero-emission) motorcycles pay the lowest rate, ${formatPounds(vedBand('zero-emission').twelveMonths)} a year - the same as a bike up to 150cc.`,
  },
  {
    q: 'Can I pay motorcycle tax monthly?',
    a: `Yes, by Direct Debit - it costs 5% more over the year. For a bike over 600cc that's ${formatPounds(top.monthlyTotal)} instead of ${formatPounds(top.twelveMonths)}.`,
  },
  {
    q: 'Does road tax transfer when I buy a used motorcycle?',
    a: 'No. Tax never comes with a vehicle any more: the seller gets a refund for any full months left, and you tax it yourself before you ride it away.',
  },
] as const;

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};

export default function MotorcycleRoadTaxPage() {
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
      <h1>Motorcycle Road Tax: How Much by Engine Size</h1>
      <p style={{ maxWidth: 'none', marginBottom: '1.5rem' }}>
        Motorcycle road tax (vehicle excise duty, or VED) depends on one thing: the engine size.
        These are the official rates from GOV.UK, checked on {checkedLabel(MOTORCYCLE_VED_CHECKED)}.
        DVLA usually changes the amounts each April.
      </p>

      <h2>Motorcycle tax rates</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Engine size</th>
              <th scope="col">12 months</th>
              <th scope="col">6 months</th>
              <th scope="col">Monthly Direct Debit (year total)</th>
            </tr>
          </thead>
          <tbody>
            {MOTORCYCLE_VED_BANDS.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td className={styles.price}>{formatPounds(b.twelveMonths)}</td>
                <td>{b.sixMonths == null ? 'Not available' : formatPounds(b.sixMonths)}</td>
                <td>{formatPounds(b.monthlyTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ maxWidth: 'none' }}>
        The same rates apply with a sidecar. Source: GOV.UK vehicle tax rate tables.
      </p>

      <h2>Which band is my bike in?</h2>
      <p style={{ maxWidth: 'none' }}>
        The engine size is on the V5C logbook, as the cylinder capacity in cc. Some common examples:
      </p>
      <ul style={{ maxWidth: 'none' }}>
        <li>A 125cc learner bike, such as a Honda CB125F: {formatPounds(up150.twelveMonths)}</li>
        <li>Kawasaki Ninja 400 (399cc): {formatPounds(mid.twelveMonths)}</li>
        <li>Honda CB500F (471cc): {formatPounds(upper.twelveMonths)}</li>
        <li>
          A &quot;600&quot; sports bike such as a Yamaha R6 (599cc): {formatPounds(upper.twelveMonths)} - it&apos;s just
          under the line
        </li>
        <li>Yamaha MT-07 (689cc), or anything else over 600cc: {formatPounds(top.twelveMonths)}</li>
      </ul>

      <h2>Paying monthly or every six months</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>12 months in one go, or by annual Direct Debit,</strong> costs the same - the cheapest
          way to pay.
        </li>
        <li>
          <strong>Monthly Direct Debit costs 5% more</strong> over the year: {formatPounds(top.monthlyTotal)}{' '}
          instead of {formatPounds(top.twelveMonths)} for a bike over 600cc.
        </li>
        <li>
          <strong>Six months at a time</strong> costs more again over a year - two lots of{' '}
          {formatPounds(top.sixMonths!)} is {formatPounds(top.sixMonths! * 2)} - and isn&apos;t offered at all for
          bikes up to 150cc or electric bikes.
        </li>
      </ul>

      <h2>Electric motorcycles</h2>
      <p style={{ maxWidth: 'none' }}>
        Electric (zero-emission) motorcycles pay the lowest rate, {formatPounds(vedBand('zero-emission').twelveMonths)} a
        year - the same as a bike up to 150cc.
      </p>

      <h2>Who doesn&apos;t pay</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Historic bikes.</strong> A motorcycle built more than 40 years ago can go into the
          historic vehicle tax class and pay nothing - but you still have to tax it in that class; it
          doesn&apos;t happen by itself.
        </li>
        <li>
          <strong>Bikes off the road.</strong> Declare it SORN and there&apos;s no tax to pay - but it
          can&apos;t be ridden or kept on a public road.
        </li>
      </ul>

      <h2>Buying or selling a used motorcycle</h2>
      <ul style={{ maxWidth: 'none' }}>
        <li>
          <strong>Tax doesn&apos;t transfer.</strong> Once DVLA is told about the sale, the seller gets a
          refund for any full months left.
        </li>
        <li>
          <strong>Tax it before you ride it away,</strong> using the reference number on the green new
          keeper slip from the V5C. It takes a few minutes online.
        </li>
        <li>
          <strong>Check any bike&apos;s tax status free</strong> on GOV.UK by registration - or run the
          registration through <Link href="/buying-guide">RoadVerdict&apos;s free motorcycle history check</Link>{' '}
          for the MOT history too.
        </li>
      </ul>

      <h2>Tricycles</h2>
      <p style={{ maxWidth: 'none' }}>
        Tricycles up to 450kg unladen pay {formatPounds(TRICYCLE_VED.upTo150OrElectric)} a year up to 150cc or if
        electric, and {formatPounds(TRICYCLE_VED.allOther)} for all others.
      </p>

      <h2>Road tax is the smallest part</h2>
      <p style={{ maxWidth: 'none' }}>
        Tax is the one fixed, predictable bill - servicing, tyres and insurance usually cost far more.
        For the whole picture, try the{' '}
        <Link href="/cost-calculator">motorcycle running cost calculator</Link>, see{' '}
        <Link href="/motorcycles/costs/mot">what a motorcycle MOT costs</Link>, or read{' '}
        <Link href="/guides/cost-of-owning-a-motorcycle">the real cost of owning a motorcycle</Link>.
        And so the renewal never sneaks up on you,{' '}
        <Link href="/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike">set a tax reminder in a free logbook</Link>.
      </p>

      <h2>Common questions</h2>
      {FAQ.map((f) => (
        <div key={f.q} style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', margin: '0 0 0.3rem' }}>{f.q}</h3>
          <p style={{ maxWidth: 'none', margin: 0 }}>{f.a}</p>
        </div>
      ))}

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        Rates from GOV.UK, checked {checkedLabel(MOTORCYCLE_VED_CHECKED)}. Always check GOV.UK for the
        current figure before you pay.
      </p>
    </div>
  );
}
