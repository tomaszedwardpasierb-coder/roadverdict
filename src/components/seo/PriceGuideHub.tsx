// The price-guide index for one vehicle kind (/cars/costs, /motorcycles/costs).
import Link from 'next/link';
import { buildBreadcrumbTrailJsonLd } from '@/lib/seo/breadcrumbs';
import {
  PRICE_GUIDES,
  VEHICLE_LABEL,
  VEHICLE_PATH,
  formatPounds,
  overallRange,
  priceGuideHubPath,
  priceGuidePath,
  type GuideVehicle,
} from '@/lib/seo/priceGuides';
import styles from './PriceGuide.module.css';

const HUB_COPY: Record<GuideVehicle, { h1: string; intro: string }> = {
  car: {
    h1: 'Car service and repair costs in the UK',
    intro:
      'What common car jobs typically cost, by car size - from named, dated sources, with how well sourced each figure is shown right next to it. Use them to sanity-check a quote before you agree to it, or run your own quote through the free Quote Checker for a verdict on your specific car.',
  },
  motorcycle: {
    h1: 'Motorcycle service and repair costs in the UK',
    intro:
      'What common motorcycle jobs typically cost, by engine size - from named, dated sources, with how well sourced each figure is shown right next to it. Use them to sanity-check a quote before you agree to it, or run your own quote through the free Quote Checker for a verdict on your specific bike.',
  },
};

export function PriceGuideHub({ vehicle }: { vehicle: GuideVehicle }) {
  const label = VEHICLE_LABEL[vehicle];
  const copy = HUB_COPY[vehicle];
  const guides = PRICE_GUIDES[vehicle];
  const other: GuideVehicle = vehicle === 'car' ? 'motorcycle' : 'car';
  const hubName = `${label.noun.charAt(0).toUpperCase()}${label.noun.slice(1)} price guides`;
  const quoteChecker = vehicle === 'car' ? '/cars/quote-checker' : '/quote-checker';
  const costCalculator = vehicle === 'car' ? '/cars/cost-calculator' : '/cost-calculator';

  const breadcrumbs = [
    { name: label.hub, path: VEHICLE_PATH[vehicle] },
    { name: hubName, path: priceGuideHubPath(vehicle) },
  ];
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: guides.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: g.h1,
      url: `https://roadverdict.co.uk${priceGuidePath(g)}`,
    })),
  };

  return (
    <article className={styles.page}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildBreadcrumbTrailJsonLd(breadcrumbs)) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href={VEHICLE_PATH[vehicle]}>{label.hub}</Link>
          </li>
          <li aria-current="page">{hubName}</li>
        </ol>
      </nav>

      <p className={styles.eyebrow}>Price guides</p>
      <h1>{copy.h1}</h1>
      <p>{copy.intro}</p>

      <div className={styles.related}>
        {guides.map((g) => {
          const range = overallRange(g);
          return (
            <Link key={g.slug} href={priceGuidePath(g)} className={styles.card}>
              <span className={styles.cardTitle}>{g.kind === 'mot' ? 'MOT' : g.name}</span>
              <span className={styles.cardMeta}>{g.summary}</span>
              <span className={styles.cardPrice}>
                {g.kind === 'mot'
                  ? `Up to ${formatPounds(range.high)}`
                  : `${formatPounds(range.low)} - ${formatPounds(range.high)}`}
              </span>
            </Link>
          );
        })}
      </div>

      <h2>How these prices are put together</h2>
      <p>
        Every figure comes from a named, dated source - published price guides from garages, breakdown providers and
        tyre retailers - and is marked by how well sourced it is. Where no source prices a job on its own, we derive it
        from one that does and say so on the page. Prices are for mainstream brands; premium brands and London garages
        usually cost more. We only publish a guide for a job we have real sources for - so if a job isn&apos;t listed
        here yet, that&apos;s why.
      </p>

      <h2>Got a quote in front of you?</h2>
      <p>
        The <Link href={quoteChecker}>{label.noun} Quote Checker</Link> compares your exact quote with these benchmarks,
        adjusted for your {label.noun}&apos;s brand and your region, and tells you if it&apos;s fair, high, or worth a second
        opinion. To see what your {label.noun} costs to run over a whole year, try the{' '}
        <Link href={costCalculator}>cost calculator</Link>.
      </p>
      <p>
        Looking for {VEHICLE_LABEL[other].noun} prices instead? See the{' '}
        <Link href={priceGuideHubPath(other)}>{VEHICLE_LABEL[other].noun} price guides</Link>.
      </p>
    </article>
  );
}
