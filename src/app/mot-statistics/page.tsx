// Place at: src/app/mot-statistics/page.tsx
//
// UK MOT statistics: a page of sourced numbers that writers, journalists and
// AI-written articles can cite and link to. Every figure comes from DVSA's
// published MOT data (lib/mot/motStatistics.ts, generated - never typed in)
// or from our own sourced price guides, and each one names its source.
import type { Metadata } from 'next';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import {
  findPriceGuide,
  formatPounds,
  lastReviewed,
  overallRange,
  priceGuidePath,
  MOT_FEE_SOURCE,
  MOT_MAX_FEE,
  type GuideVehicle,
} from '@/lib/seo/priceGuides';
import { MOT_STATISTICS as S, MOT_STATISTICS_SOURCE as SOURCE, type MotDefectCategory } from '@/lib/mot/motStatistics';
import { PlayStoreLink } from '@/components/PlayStoreLink';
import styles from '@/components/seo/PriceGuide.module.css';

const PATH = '/mot-statistics';

// 27.51 -> "27.5%"
function pc(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}
function rate(part: number, whole: number): number {
  return (100 * part) / whole;
}
function count(n: number): string {
  return n.toLocaleString('en-GB');
}
// 27.5% -> "more than 1 in 4": the largest whole "1 in n" the rate beats.
function moreThanOneIn(percent: number): string {
  return `more than 1 in ${Math.ceil(100 / percent)}`;
}
function millions(n: number): string {
  return `${(n / 1_000_000).toFixed(1)} million`;
}
function day(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
// "2025 to 2026" -> "2025-26"
function shortYear(fy: string): string {
  const [a, b] = fy.split(' to ');
  return `${a}-${b.slice(2)}`;
}

const cars = S.byClass.cars;
const bikes = S.byClass.motorcycles;
const all = S.byClass.all;
const carFirst = rate(cars.fails + cars.passedAfterRectification, cars.tests);
const bikeFirst = rate(bikes.fails + bikes.passedAfterRectification, bikes.tests);
const carAfter = rate(cars.fails, cars.tests);
const bikeAfter = rate(bikes.fails, bikes.tests);
const carDangerous = rate(cars.testsWithDangerousDefect, cars.tests);
const bikeDangerous = rate(bikes.testsWithDangerousDefect, bikes.tests);
const class7First = rate(S.byClass.class7.fails + S.byClass.class7.passedAfterRectification, S.byClass.class7.tests);
const topCar = S.carCategories[0];
const topBike = S.motorcycleCategories[0];
const carTyres = S.carCategories.find((c) => c.category === 'Tyres');
const firstYear = S.trend[0];
const lastYear = S.trend[S.trend.length - 1];
const YEAR_LABEL = `April ${S.year.slice(0, 4)} to March ${S.year.slice(-4)}`;

export const metadata: Metadata = pageMetadata({
  title: 'UK MOT Statistics 2026: Fail Rates and Top Failures',
  description: `DVSA figures for ${YEAR_LABEL}: ${pc(carFirst)} of cars and ${pc(bikeFirst)} of motorcycles failed their MOT first time. The most common failures, dangerous defects, the trend since ${shortYear(firstYear.year)} and what repairs cost.`,
  path: PATH,
});

// What the commonest failures cost to put right, from our price guides.
function costLine(vehicle: GuideVehicle, slug: string) {
  const guide = findPriceGuide(vehicle, slug);
  if (!guide) return null;
  const { low, high } = overallRange(guide);
  return { name: guide.name, href: priceGuidePath(guide), range: `${formatPounds(low)}-${formatPounds(high)}`, reviewed: lastReviewed(guide) };
}
const COSTS = [
  { vehicle: 'Car', line: costLine('car', 'tyres') },
  { vehicle: 'Car', line: costLine('car', 'brake-pads') },
  { vehicle: 'Motorcycle', line: costLine('motorcycle', 'tyres') },
  { vehicle: 'Motorcycle', line: costLine('motorcycle', 'brake-pads') },
  { vehicle: 'Motorcycle', line: costLine('motorcycle', 'chain-and-sprockets') },
].filter((c) => c.line);

const FAQ = [
  {
    q: 'What percentage of cars fail their MOT?',
    a: `${pc(carFirst)} of car and light van MOTs (classes 3 and 4) failed first time in ${YEAR_LABEL} - ${moreThanOneIn(carFirst)}. After repairs done on the spot at the test centre, ${pc(carAfter)} still failed.`,
  },
  {
    q: 'What is the most common reason for failing an MOT?',
    a: `For cars, lights: "${topCar.category.toLowerCase()}" failures turned up in ${pc(topCar.percentOfTests)} of all car MOTs. For motorcycles it's also lights - lamps and reflectors make up ${pc(topBike.percentOfDefects, 0)} of the defects behind motorcycle MOT failures.`,
  },
  {
    q: 'What percentage of motorcycles fail their MOT?',
    a: `${pc(bikeFirst)} of motorcycle MOTs failed first time in ${YEAR_LABEL} - about half the rate for cars. ${pc(bikeAfter)} still failed after on-the-spot repairs.`,
  },
  {
    q: 'Are MOT failure rates going down?',
    a: `Yes. The first-time fail rate for cars fell from ${pc(firstYear.cars)} in ${shortYear(firstYear.year)} to ${pc(lastYear.cars)} in ${shortYear(lastYear.year)}, and for motorcycles from ${pc(firstYear.motorcycles)} to ${pc(lastYear.motorcycles)}.`,
  },
  {
    q: 'How much does an MOT cost?',
    a: `The most a test centre can charge is ${formatPounds(MOT_MAX_FEE.car)} for a car and ${formatPounds(MOT_MAX_FEE.motorcycle)} for a motorcycle, and many charge less. The fee doesn't include any repairs.`,
  },
];

const breadcrumbJsonLd = buildBreadcrumbJsonLd('UK MOT statistics', PATH);
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
};
const datasetJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Dataset',
  name: `UK MOT statistics ${S.year.slice(-4)}: fail rates and top failures`,
  description: `MOT test results for Great Britain, ${YEAR_LABEL}, by vehicle type and failure category, with first-time fail rates since ${shortYear(firstYear.year)}. Compiled from DVSA's MOT testing data.`,
  url: `https://roadverdict.co.uk${PATH}`,
  creator: { '@type': 'Organization', name: 'RoadVerdict', url: 'https://roadverdict.co.uk' },
  isBasedOn: SOURCE.url,
  license: SOURCE.licenceUrl,
  spatialCoverage: 'Great Britain',
  temporalCoverage: `${firstYear.year.slice(0, 4)}-04/${S.year.slice(-4)}-03`,
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

function CategoryTable({ rows, label }: { rows: MotDefectCategory[]; label: string }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label={label}>
        <thead>
          <tr>
            <th scope="col">Failure category</th>
            <th scope="col">Share of all MOTs</th>
            <th scope="col">Share of failure defects</th>
            <th scope="col">Dangerous (share of all MOTs)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.category}>
              <td>{c.category}</td>
              <td className={styles.price}>{pc(c.percentOfTests, 2)}</td>
              <td>{pc(c.percentOfDefects, 1)}</td>
              <td>{c.dangerousPercentOfTests == null ? '-' : pc(c.dangerousPercentOfTests, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MotStatisticsPage() {
  const classRows = [
    { label: 'Cars and light vans (classes 3 and 4)', f: cars },
    { label: 'Motorcycles (classes 1 and 2)', f: bikes },
    { label: 'Minibuses, 13+ seats (class 5)', f: S.byClass.class5 },
    { label: 'Goods vehicles 3,000-3,500 kg (class 7)', f: S.byClass.class7 },
    { label: 'All MOT tests', f: all },
  ];

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
          <li aria-current="page">UK MOT statistics</li>
        </ol>
      </nav>

      <p className={styles.eyebrow}>DVSA data, {YEAR_LABEL}</p>
      <h1>UK MOT statistics {S.year.slice(-4)}</h1>

      <div className={styles.answer}>
        <p>Cars failing their MOT first time</p>
        <div className={styles.answerFigure}>{pc(carFirst)}</div>
        <p>
          {moreThanOneIn(carFirst)} cars, from {millions(cars.tests)} tests. Motorcycles: {pc(bikeFirst)}. Every MOT test in
          Great Britain from {YEAR_LABEL}, from DVSA&apos;s published data.
        </p>
      </div>

      <h2>Key figures</h2>
      <ul>
        <li>
          <strong>{count(all.tests)} MOT tests</strong> were carried out in Great Britain in {YEAR_LABEL}:{' '}
          {count(cars.tests)} on cars and light vans, {count(bikes.tests)} on motorcycles.
        </li>
        <li>
          <strong>{pc(carFirst)} of cars failed first time</strong> ({moreThanOneIn(carFirst)}). {count(cars.passedAfterRectification)}{' '}
          ({pc(rate(cars.passedAfterRectification, cars.tests))}) were fixed at the test centre and passed the same day, leaving{' '}
          {pc(carAfter)} as outright fails.
        </li>
        <li>
          <strong>{pc(bikeFirst)} of motorcycles failed first time</strong> - about half the car rate - and {pc(bikeAfter)} after
          on-the-spot repairs.
        </li>
        <li>
          <strong>{pc(carDangerous)} of car MOTs found at least one dangerous defect</strong> ({millions(cars.testsWithDangerousDefect)}{' '}
          tests). For motorcycles it was {pc(bikeDangerous)} ({count(bikes.testsWithDangerousDefect)} tests).
        </li>
        <li>
          <strong>Lights are the most common failure</strong> on both: {topCar.category.toLowerCase()} failures turned up in{' '}
          {pc(topCar.percentOfTests)} of all car MOTs, and lamps and reflectors make up {pc(topBike.percentOfDefects, 0)} of the
          defects behind motorcycle failures.
        </li>
        {carTyres?.dangerousPercentOfTests != null ? (
          <li>
            <strong>Tyres cause the most dangerous defects on cars:</strong> {pc(carTyres.dangerousPercentOfTests, 2)} of all car
            MOTs found a dangerous tyre defect, more than any other category.
          </li>
        ) : null}
        {S.averageDefectsPerFailure.cars != null && S.averageDefectsPerFailure.motorcycles != null ? (
          <li>
            <strong>A failed car has {S.averageDefectsPerFailure.cars} defects on average</strong>; a failed motorcycle{' '}
            {S.averageDefectsPerFailure.motorcycles}.
          </li>
        ) : null}
        <li>
          <strong>Larger vans fail most:</strong> {pc(class7First)} of goods vehicles from 3,000 to 3,500 kg (class 7) failed
          first time.
        </li>
        <li>
          <strong>Fail rates are falling:</strong> cars from {pc(firstYear.cars)} in {shortYear(firstYear.year)} to{' '}
          {pc(lastYear.cars)}, motorcycles from {pc(firstYear.motorcycles)} to {pc(lastYear.motorcycles)}.
        </li>
        <li>
          <strong>{count(S.testStations)} MOT test stations</strong> and {count(S.testers)} testers carried out the tests.
        </li>
        <li>
          <strong>The most an MOT can cost</strong> is {formatPounds(MOT_MAX_FEE.car)} for a car and{' '}
          {formatPounds(MOT_MAX_FEE.motorcycle)} for a motorcycle - the government limit, which hasn&apos;t changed since 2010.
        </li>
      </ul>

      <h2>MOT results by vehicle type</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={`MOT results by vehicle type, ${YEAR_LABEL}`}>
          <thead>
            <tr>
              <th scope="col">Vehicle type</th>
              <th scope="col">Tests</th>
              <th scope="col">Failed first time</th>
              <th scope="col">Failed after on-the-spot repairs</th>
              <th scope="col">At least one dangerous defect</th>
            </tr>
          </thead>
          <tbody>
            {classRows.map(({ label, f }) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{count(f.tests)}</td>
                <td className={styles.price}>{pc(rate(f.fails + f.passedAfterRectification, f.tests), 2)}</td>
                <td>{pc(rate(f.fails, f.tests), 2)}</td>
                <td>{pc(rate(f.testsWithDangerousDefect, f.tests), 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Why cars fail their MOT</h2>
      <p>
        The share of all car and light van MOTs that failed on each category, the category&apos;s share of all the defects found
        on failed tests, and how often it was a dangerous defect. A test can fail on several categories at once.
      </p>
      <CategoryTable rows={S.carCategories.slice(0, 10)} label={`Car MOT failures by category, ${YEAR_LABEL}`} />

      <h2>Why motorcycles fail their MOT</h2>
      <CategoryTable rows={S.motorcycleCategories} label={`Motorcycle MOT failures by category, ${YEAR_LABEL}`} />
      <p>
        Lights alone make up {pc(topBike.percentOfDefects, 0)} of the defects behind motorcycle MOT failures - and a blown
        bulb or a cracked lens is the easiest fail to avoid with a two-minute check before the test.
      </p>

      {COSTS.length > 0 ? (
        <>
          <h2>What fixing the common failures costs</h2>
          <p>
            Typical UK prices from RoadVerdict&apos;s price guides, which name and date their sources. The range covers small to
            large vehicles; follow a link for your size.
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label={`Typical repair costs for common MOT failures`}>
              <thead>
                <tr>
                  <th scope="col">Repair</th>
                  <th scope="col">Typical cost</th>
                </tr>
              </thead>
              <tbody>
                {COSTS.map((c) => (
                  <tr key={`${c.vehicle}-${c.line!.name}`}>
                    <td>
                      <Link href={c.line!.href}>
                        {c.vehicle}: {c.line!.name.toLowerCase()}
                      </Link>
                    </td>
                    <td className={styles.price}>{c.line!.range}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h2>MOT fail rates over time</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table} aria-label={`First-time MOT fail rates by year`}>
          <thead>
            <tr>
              <th scope="col">Year (April to March)</th>
              <th scope="col">Cars and light vans</th>
              <th scope="col">Motorcycles</th>
            </tr>
          </thead>
          <tbody>
            {[...S.trend].reverse().map((t) => (
              <tr key={t.year}>
                <td>{shortYear(t.year)}</td>
                <td>{pc(t.cars)}</td>
                <td>{pc(t.motorcycles)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Two things to bear in mind when comparing years: the MOT&apos;s defect categories changed on 20 May 2018 (dangerous,
        major and minor), and vehicles due an MOT between 30 March and 31 July 2020 had it postponed by six months because of COVID-19.
      </p>

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
      <PlayStoreLink campaign="mot-statistics" lead="On Android?" label="Get MOT reminders in the RoadVerdict app" />

      <h2>About these figures</h2>
      <div className={styles.sources}>
        <ul>
          <li>
            <strong>Source:</strong> <a href={SOURCE.url}>{SOURCE.name}</a>, published {day(SOURCE.published)}. DVSA notes the
            data isn&apos;t classed as official statistics. Contains public sector information licensed under the{' '}
            <a href={SOURCE.licenceUrl}>{SOURCE.licence}</a>.
          </li>
          <li>
            <strong>&quot;Failed first time&quot;</strong> is DVSA&apos;s initial fail rate: tests that failed, plus tests that
            failed but were fixed at the test centre within an hour and passed. We worked every rate out again from DVSA&apos;s
            own counts, and they match its published percentages.
          </li>
          <li>
            <strong>A correction:</strong> in DVSA&apos;s {shortYear(S.year)} results table, the counts of tests with a dangerous
            defect are swapped between cars and motorcycles (and between classes 5 and 7). We use the corrected figures, which
            match DVSA&apos;s own failure-category tables and add up to its overall total. We use the full-year totals only.
          </li>
          <li>
            <strong>Repair costs</strong> come from RoadVerdict&apos;s price guides; MOT fees from{' '}
            <a href={MOT_FEE_SOURCE.url}>{MOT_FEE_SOURCE.name}</a>.
          </li>
        </ul>
      </div>

      <h2>Using these figures</h2>
      <p>
        You&apos;re welcome to quote anything on this page. Please credit and link to it: <em>RoadVerdict, &quot;UK MOT statistics{' '}
        {S.year.slice(-4)}&quot;, roadverdict.co.uk/mot-statistics, from DVSA data</em>. Journalists who need a different cut of
        the data can email <a href="mailto:hello@roadverdict.co.uk">hello@roadverdict.co.uk</a>.
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
        Figures from DVSA&apos;s MOT testing data, published {day(SOURCE.published)}; repair costs last reviewed{' '}
        {COSTS.length > 0 ? day(COSTS.map((c) => c.line!.reviewed.length === 7 ? `${c.line!.reviewed}-01` : c.line!.reviewed).sort().at(-1)!) : '-'}.
        Updated when DVSA publishes a new year, usually each September.
      </p>
    </article>
  );
}
