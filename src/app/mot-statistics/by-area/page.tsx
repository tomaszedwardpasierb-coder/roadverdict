// Place at: src/app/mot-statistics/by-area/page.tsx
//
// Car MOT fail rates for every postcode area in Great Britain, ranked: the
// page the press pitches link to. Every figure, including the sentences in
// "Key findings", is worked out from lib/mot/motAreaStatistics.ts, which is
// generated from DVSA's test-by-test data - never typed in.
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { buildBreadcrumbTrailJsonLd } from '@/lib/seo/breadcrumbs';
import {
  MOT_AREA_STATISTICS as A,
  MOT_AREA_STATISTICS_SOURCE as SOURCE,
  type MotAreaCounts,
} from '@/lib/mot/motAreaStatistics';
import { PlayStoreLink } from '@/components/PlayStoreLink';
import styles from '@/components/seo/PriceGuide.module.css';

const PATH = '/mot-statistics/by-area';
const MAP_SRC = `/images/mot-fail-rate-map-${A.year}.png`;
const FINE_SOURCE = { name: 'GOV.UK: Getting an MOT', url: 'https://www.gov.uk/getting-an-mot/after-the-test' };

function pc(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}
function failRate(a: MotAreaCounts): number {
  return (100 * a.failedFirstTime) / a.tests;
}
function dangerousRate(a: MotAreaCounts): number {
  return (100 * a.testsWithDangerousDefect) / a.tests;
}
function count(n: number): string {
  return n.toLocaleString('en-GB');
}
function millions(n: number): string {
  return `${(n / 1_000_000).toFixed(1)} million`;
}
// 9.38% -> "about 1 in 11"
function aboutOneIn(percent: number): string {
  return `about 1 in ${Math.round(100 / percent)}`;
}
// ["a", "b", "c"] -> "a, b and c"
function list(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

const GB = A.greatBritain;
const AREAS = A.areas;
const worst = AREAS[0];
const best = AREAS[AREAS.length - 1];
const highest12 = AREAS.slice(0, 12);
const londonInLowest10 = AREAS.slice(-10).filter((a) => a.london).length;
const mostDangerous = [...AREAS].sort((x, y) => dangerousRate(y) - dangerousRate(x))[0];
// Which defect is the top failure in the most areas.
const topCounts = new Map<string, number>();
for (const a of AREAS) topCounts.set(a.topFailure.defect, (topCounts.get(a.topFailure.defect) ?? 0) + 1);
const [commonestTop, commonestTopAreas] = [...topCounts.entries()].sort((x, y) => y[1] - x[1])[0];

export const metadata: Metadata = pageMetadata({
  title: `MOT Fail Rates by Postcode Area ${A.year}: Best and Worst`,
  description: `${worst.name} has Britain's highest car MOT fail rate (${pc(failRate(worst))}), ${best.name} the lowest (${pc(failRate(best))}). All ${AREAS.length} postcode areas ranked from DVSA's ${A.year} test data, with dangerous defects and the top failure in each.`,
  path: PATH,
});

const FAQ = [
  {
    q: 'Which area has the highest MOT failure rate?',
    a: `${worst.name} (${worst.code} postcodes): ${pc(failRate(worst))} of cars failed their MOT first time in ${A.year}, against ${pc(failRate(GB))} across Great Britain. Its most common failure was "${worst.topFailure.defect.toLowerCase()}".`,
  },
  {
    q: 'Which area has the lowest MOT failure rate?',
    a: `${best.name} (${best.code} postcodes), where ${pc(failRate(best))} of cars failed first time. ${londonInLowest10} of the 10 lowest are London postcode areas.`,
  },
  {
    q: 'What is the most common reason cars fail their MOT?',
    a: `It varies by area. "${commonestTop}" is the single most common failure in ${commonestTopAreas} of the ${AREAS.length} areas; the table shows the top one for each.`,
  },
];

const breadcrumbJsonLd = buildBreadcrumbTrailJsonLd([
  { name: 'UK MOT statistics', path: '/mot-statistics' },
  { name: 'MOT fail rates by area', path: PATH },
]);
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};
const datasetJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: `Car MOT fail rates by postcode area, Great Britain ${A.year}`,
  description: `First-time MOT fail rates, dangerous defects, average vehicle age and the most common failure for cars and light vans in each of ${AREAS.length} postcode areas, ${A.year}. Compiled from DVSA's anonymised MOT test data.`,
  url: `https://roadverdict.co.uk${PATH}`,
  creator: { '@type': 'Organization', name: 'RoadVerdict', url: 'https://roadverdict.co.uk' },
  isBasedOn: SOURCE.url,
  license: SOURCE.licenceUrl,
  spatialCoverage: 'Great Britain',
  temporalCoverage: `${A.year}-01/${A.year}-12`,
};

function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function MotAreaStatisticsPage() {
  return (
    <article className={styles.page}>
      <JsonLd data={breadcrumbJsonLd} />
      <JsonLd data={faqJsonLd} />
      <JsonLd data={datasetJsonLd} />

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/">Home</Link>
          </li>
          <li>
            <Link href="/mot-statistics">UK MOT statistics</Link>
          </li>
          <li aria-current="page">MOT fail rates by area</li>
        </ol>
      </nav>

      <p className={styles.eyebrow}>DVSA data, cars, {A.year}</p>
      <h1>MOT fail rates by area {A.year}</h1>

      <div className={styles.answer}>
        <p>Highest car MOT fail rate in Britain</p>
        <div className={styles.answerFigure}>{pc(failRate(worst))}</div>
        <p>
          {worst.name} ({worst.code} postcodes). The lowest is {best.name}, at {pc(failRate(best))}. Across Great Britain{' '}
          {pc(failRate(GB))} of cars failed first time, from {millions(GB.tests)} car MOTs in {A.year}.
        </p>
      </div>

      <h2>Key findings</h2>
      <ul>
        <li>
          <strong>
            {worst.name} has the highest fail rate: {pc(failRate(worst))}
          </strong>{' '}
          of cars failed first time, against {pc(failRate(GB))} nationally
          {worst.averageAgeYears < GB.averageAgeYears
            ? `, even though its cars are younger than average (${worst.averageAgeYears} years at test, against ${GB.averageAgeYears})`
            : ''}
          . Its most common failure was &quot;{worst.topFailure.defect.toLowerCase()}&quot;, recorded{' '}
          {count(worst.topFailure.times)} times.
        </li>
        <li>
          <strong>The 12 highest fail rates:</strong> {list(highest12.map((a) => a.name))}.
        </li>
        <li>
          <strong>
            {best.name} has the lowest: {pc(failRate(best))}.
          </strong>{' '}
          {londonInLowest10} of the 10 lowest are London postcode areas.
        </li>
        <li>
          <strong>
            {pc(dangerousRate(GB))} of car MOTs found at least one dangerous defect
          </strong>{' '}
          ({count(GB.testsWithDangerousDefect)} cars). The highest share was in {mostDangerous.name}: {pc(dangerousRate(mostDangerous))},{' '}
          {aboutOneIn(dangerousRate(mostDangerous))}. Driving a car with a dangerous defect can mean a fine of up to £2,500 and 3
          penalty points.
        </li>
        <li>
          <strong>&quot;{commonestTop}&quot;</strong> is the most common single failure in {commonestTopAreas} of the{' '}
          {AREAS.length} areas.
        </li>
      </ul>

      <h2>The map</h2>
      {/* Drawn by scripts/make-mot-fail-rate-map.py from the same figures.
          Served as the file itself (unoptimized): it's already small, and
          the image optimiser is the slow part of the site. */}
      <figure style={{ margin: '0 0 1.5rem' }}>
        <a href={MAP_SRC}>
          <Image
            src={MAP_SRC}
            width={1500}
            height={1900}
            unoptimized
            alt={`Map of Great Britain's postcode areas shaded by the share of cars failing their first MOT in ${A.year}: highest in ${worst.name} (${pc(failRate(worst))}) and the South West, lowest in outer London, with ${best.name} at ${pc(failRate(best))}.`}
            style={{ width: '100%', maxWidth: '40rem', height: 'auto', display: 'block' }}
          />
        </a>
        <figcaption style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
          Tap the map for the full size. You can share it under CC BY-SA 3.0, credited to RoadVerdict. Postcode area
          boundaries © Wikipedia contributors (CC BY-SA 3.0).
        </figcaption>
      </figure>

      <h2>Every postcode area, highest fail rate first</h2>
      <p>
        Cars and light vans, first MOT tests in {A.year}. &quot;Dangerous&quot; is the share of tests that found at least one
        dangerous defect. Age is the car&apos;s average age at the test.
      </p>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={`Car MOT fail rates by postcode area, ${A.year}`}>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Postcode area</th>
              <th scope="col">Car MOTs</th>
              <th scope="col">Failed first time</th>
              <th scope="col">Dangerous defect</th>
              <th scope="col">Average age</th>
              <th scope="col">Most common failure</th>
            </tr>
          </thead>
          <tbody>
            {AREAS.map((a, i) => (
              <tr key={a.code}>
                <td>{i + 1}</td>
                <td>
                  {a.name} ({a.code})
                </td>
                <td>{count(a.tests)}</td>
                <td className={styles.price}>{pc(failRate(a))}</td>
                <td>{pc(dangerousRate(a))}</td>
                <td>{a.averageAgeYears} years</td>
                <td>
                  {a.topFailure.defect} ({count(a.topFailure.times)})
                </td>
              </tr>
            ))}
            <tr>
              <td>-</td>
              <td>Great Britain</td>
              <td>{count(GB.tests)}</td>
              <td className={styles.price}>{pc(failRate(GB))}</td>
              <td>{pc(dangerousRate(GB))}</td>
              <td>{GB.averageAgeYears} years</td>
              <td>-</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Reading the table</h2>
      <ul>
        <li>
          <strong>The area is where the test centre is,</strong> not where the car is kept. Most people test near home, but not
          all.
        </li>
        <li>
          <strong>It shows where cars fail more, not why.</strong> The age and mix of cars, the roads and the weather, and how
          test centres work can all play a part. Older cars fail more often, so the average age is shown alongside.
        </li>
        <li>
          <strong>Which areas are ranked:</strong>{' '}
          {A.leftOut.length > 0
            ? `areas with fewer than ${count(A.minTests)} car MOTs are left out (${list(A.leftOut)}), though their tests count in the Great Britain total.`
            : `every postcode area with car MOTs, each with more than ${count(A.minTests)}.`}
          {A.noCarTests.length > 0 ? ` ${list(A.noCarTests)} recorded no car MOTs.` : ''}
          {A.noAreaTests > 0 ? ` ${count(A.noAreaTests)} tests with no postcode area recorded count only in the Great Britain total.` : ''}
        </li>
        <li>
          <strong>Why the national figure differs from our{' '}
          <Link href="/mot-statistics">UK MOT statistics</Link> page:</strong> this page counts calendar year {A.year} and cars and
          light vans (class 4) from DVSA&apos;s test-by-test data; that page uses DVSA&apos;s summary tables for April to March,
          classes 3 and 4.
        </li>
      </ul>

      <section className={styles.cta} aria-labelledby="cta-heading">
        <p className={styles.ctaTitle} id="cta-heading">
          Check one vehicle
        </p>
        <p>
          See any car or motorcycle&apos;s full MOT history by registration, with every advisory and failure explained and what
          the repairs usually cost. Free, no account needed.
        </p>
        <Link href="/mot-check" className="btn-primary">
          Free MOT history check
        </Link>
      </section>
      <PlayStoreLink campaign="mot-statistics-by-area" lead="On Android?" label="Get MOT reminders in the RoadVerdict app" />

      <h2>About these figures</h2>
      <div className={styles.sources}>
        <ul>
          <li>
            <strong>Source:</strong> <a href={SOURCE.url}>{SOURCE.name}</a>, every MOT test in Great Britain in {A.year}.
            Contains public sector information licensed under the <a href={SOURCE.licenceUrl}>{SOURCE.licence}</a>.
          </li>
          <li>
            <strong>&quot;Failed first time&quot;</strong> counts first tests that failed, plus those that failed but were fixed
            at the test centre within an hour and passed, as DVSA counts it. Retests, appeals and abandoned tests are left out.
          </li>
          <li>
            <strong>&quot;Dangerous defect&quot;</strong> means the test recorded at least one defect DVSA classes as dangerous.
            The fine for driving with one is from <a href={FINE_SOURCE.url}>{FINE_SOURCE.name}</a>.
          </li>
        </ul>
      </div>

      <h2>Using these figures</h2>
      <p>
        You&apos;re welcome to quote anything on this page. Please credit and link to it:{' '}
        <em>
          RoadVerdict, &quot;MOT fail rates by area {A.year}&quot;, roadverdict.co.uk/mot-statistics/by-area, from DVSA data
        </em>
        . Journalists who want the figures for one area, or as a spreadsheet, can email{' '}
        <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
      </p>

      <section className={styles.faq} aria-labelledby="faq-heading">
        <h2 id="faq-heading">Common questions</h2>
        {FAQ.map((f) => (
          <div key={f.q}>
            <h3>{f.q}</h3>
            <p>{f.a}</p>
          </div>
        ))}
      </section>

      <p className={styles.smallPrint}>
        Figures from DVSA&apos;s anonymised MOT test data for {A.year}. See also{' '}
        <Link href="/mot-statistics">UK MOT statistics</Link> for fail rates by vehicle type, the top failure categories and the
        trend since 2013.
      </p>
    </article>
  );
}
