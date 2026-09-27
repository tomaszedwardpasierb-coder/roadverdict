// One price guide page (e.g. /cars/costs/full-service). A server
// component with no client JavaScript - these pages are static, cacheable
// and meant to load instantly from search. Everything shown comes from
// lib/seo/priceGuides.ts; see that file for the honesty rules.
import Link from 'next/link';
import { buildBreadcrumbTrailJsonLd } from '@/lib/seo/breadcrumbs';
import {
  CONFIDENCE_LABEL,
  MOT_FEE_SOURCE,
  VEHICLE_LABEL,
  VEHICLE_PATH,
  costFaq,
  findPriceGuide,
  formatPounds,
  lastReviewed,
  overallRange,
  priceGuideHubPath,
  priceGuidePath,
  priceRows,
  quoteCheckerHref,
  type PriceGuide,
} from '@/lib/seo/priceGuides';
import { AffiliateLine } from '@/components/AffiliateLine';
import { sportsbikeshopLinksForJob } from '@/lib/affiliates';
import styles from './PriceGuide.module.css';

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function reviewedLabel(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function PriceGuidePage({ guide }: { guide: PriceGuide }) {
  const vehicle = VEHICLE_LABEL[guide.vehicle];
  const hubPath = priceGuideHubPath(guide.vehicle);
  const hubName = `${capitalise(vehicle.noun)} price guides`;
  const faqs = [costFaq(guide), ...guide.faqs];
  const range = overallRange(guide);
  const reviewed = lastReviewed(guide);
  const related = guide.related.map((slug) => findPriceGuide(guide.vehicle, slug)).filter((g): g is PriceGuide => !!g);
  const otherVehicle = guide.vehicle === 'car' ? 'motorcycle' : 'car';
  const twin = findPriceGuide(otherVehicle, guide.slug);

  const breadcrumbs = [
    { name: vehicle.hub, path: VEHICLE_PATH[guide.vehicle] },
    { name: hubName, path: hubPath },
    { name: guide.name, path: priceGuidePath(guide) },
  ];
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };

  const rows = guide.kind === 'benchmark' ? priceRows(guide) : [];
  // One entry per distinct source, so a source used for all three sizes
  // is listed once.
  const sources = [...new Map(rows.map((r) => [r.sourceName, r])).values()];

  return (
    <article className={styles.page}>
      <JsonLd data={buildBreadcrumbTrailJsonLd(breadcrumbs)} />
      <JsonLd data={faqJsonLd} />

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          {breadcrumbs.map((c, i) =>
            i === breadcrumbs.length - 1 ? (
              <li key={c.path} aria-current="page">
                {c.name}
              </li>
            ) : (
              <li key={c.path}>
                <Link href={c.path}>{c.name}</Link>
              </li>
            )
          )}
        </ol>
      </nav>

      <p className={styles.eyebrow}>{capitalise(vehicle.noun)} price guide</p>
      <h1>{guide.h1}</h1>

      <div className={styles.answer}>
        <p>{guide.kind === 'mot' ? 'Maximum fee, set by law' : `Typical UK price, depending on ${vehicle.noun} size`}</p>
        <div className={styles.answerFigure}>
          {range.low === range.high ? formatPounds(range.low) : `${formatPounds(range.low)} - ${formatPounds(range.high)}`}
        </div>
        <p>Figures last reviewed {reviewedLabel(reviewed)}.</p>
      </div>

      <p>{guide.intro}</p>

      {guide.kind === 'benchmark' ? (
        <>
          <h2>Typical prices by {vehicle.noun} size</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{capitalise(vehicle.noun)} size</th>
                  <th scope="col">Typical price</th>
                  <th scope="col">How well sourced</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.size}>
                    <td>{r.sizeLabel}</td>
                    <td className={styles.price}>
                      {formatPounds(r.low)} - {formatPounds(r.high)}
                    </td>
                    <td>
                      <span className={`${styles.confidence} ${styles[`confidence_${r.confidence}`]}`}>{CONFIDENCE_LABEL[r.confidence]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.sizeLinks}>
            Check a quote for a{' '}
            {rows.map((r, i) => (
              <span key={r.size}>
                {i > 0 ? (i === rows.length - 1 ? ' or ' : ', ') : ''}
                <Link href={quoteCheckerHref(guide, r.size)}>{r.sizeLabel.split(' ')[0].toLowerCase()}</Link>
              </span>
            ))}{' '}
            {vehicle.noun}.
          </p>
          <div className={styles.sources}>
            <p>
              Prices are for mainstream brands. Premium brands, and garages in London and the South East, usually charge
              more - the Quote Checker adjusts for your {vehicle.noun}&apos;s brand and region. Where these figures come from:
            </p>
            <ul>
              {sources.map((s) => (
                <li key={s.sourceName}>
                  {s.sourceName} (published {s.sourceDate}, reviewed {s.lastReviewed}){s.note ? ` - ${s.note}` : ''}
                </li>
              ))}
            </ul>
          </div>

          <section className={styles.cta} aria-labelledby="cta-heading">
            <p className={styles.ctaTitle} id="cta-heading">
              Been quoted for {guide.quotedFor}?
            </p>
            <p>
              Enter the price you were quoted and get a straight answer - fair, high, or worth a second opinion - against
              these same benchmarks, adjusted for your {vehicle.noun}. Free, no account needed.
            </p>
            <Link href={quoteCheckerHref(guide)} className="btn-primary">
              Check my quote
            </Link>
          </section>
          {guide.vehicle === 'motorcycle' ? (
            // Few riders fit their own tyres - they buy them and pay a fitter.
            <AffiliateLine
              lead={guide.job === 'tyres-pair' ? 'Buying your own?' : 'Doing it yourself?'}
              links={sportsbikeshopLinksForJob(guide.job, 'priceGuides')}
            />
          ) : null}
        </>
      ) : (
        <>
          <h2>The maximum MOT fee</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Vehicle</th>
                  <th scope="col">Maximum fee</th>
                </tr>
              </thead>
              <tbody>
                {guide.fees.map((f) => (
                  <tr key={f.label}>
                    <td>{f.label}</td>
                    <td className={styles.price}>{formatPounds(f.maxFee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.sources}>
            <p>
              Source:{' '}
              <a href={MOT_FEE_SOURCE.url} rel="noopener noreferrer" target="_blank">
                {MOT_FEE_SOURCE.name}
              </a>
              , checked {reviewedLabel(MOT_FEE_SOURCE.checked)}. You don&apos;t pay VAT on the fee.
            </p>
          </div>

          <h2>Key dates and rules</h2>
          <ul>
            {guide.keyFacts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>

          <section className={styles.cta} aria-labelledby="cta-heading">
            <p className={styles.ctaTitle} id="cta-heading">
              Never miss your MOT
            </p>
            <p>
              Add your {vehicle.noun} to RoadVerdict and we&apos;ll keep track of the MOT date - along with tax, insurance and
              servicing - and read its full MOT history for you. Free.
            </p>
            <Link
              href={`/login?redirect=${encodeURIComponent(`/dashboard?addVehicle=${guide.vehicle === 'car' ? 'car' : 'bike'}`)}`}
              className="btn-primary"
            >
              Track my {vehicle.noun} free
            </Link>
          </section>
        </>
      )}

      <h2>{guide.kind === 'mot' ? 'What an MOT checks' : 'What’s usually included'}</h2>
      <ul>
        {guide.includes.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>What changes the price</h2>
      <ul>
        {guide.priceDrivers.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>How to make sure you&apos;re paying a fair price</h2>
      <ul>
        {guide.fairPriceTips.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>Red flags</h2>
      <ul>
        {guide.redFlags.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <section className={styles.faq} aria-labelledby="faq-heading">
        <h2 id="faq-heading">Questions people ask</h2>
        {faqs.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>

      <h2>More {vehicle.noun} price guides</h2>
      <div className={styles.related}>
        {related.map((g) => (
          <Link key={g.slug} href={priceGuidePath(g)} className={styles.card}>
            <span className={styles.cardTitle}>{g.name}</span>
            <span className={styles.cardMeta}>{g.summary}</span>
          </Link>
        ))}
        <Link href={hubPath} className={styles.card}>
          <span className={styles.cardTitle}>All {vehicle.noun} price guides</span>
          <span className={styles.cardMeta}>Every job we have sourced prices for.</span>
        </Link>
        {twin ? (
          <Link href={priceGuidePath(twin)} className={styles.card}>
            <span className={styles.cardTitle}>
              {twin.name} - {VEHICLE_LABEL[otherVehicle].noun} prices
            </span>
            <span className={styles.cardMeta}>The same job on a {VEHICLE_LABEL[otherVehicle].noun}.</span>
          </Link>
        ) : null}
      </div>

      <p className={styles.smallPrint}>
        RoadVerdict price guides are benchmarks from named, dated sources, not a quote for your {vehicle.noun}. Every figure
        shows how well sourced it is, and where no source prices a job directly we say so.
      </p>
    </article>
  );
}
