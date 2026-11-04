// Place at: src/app/mot-check/page.tsx
//
// The free MOT check: any UK registration, no account. Shows the vehicle's
// MOT record with every defect explained in plain English, a RoadVerdict
// MOT score, and a way to save the vehicle to a free logbook.
//
// A plain GET form, so the lookup runs on the server and works with no
// JavaScript; a result page (?vrm=...) is never indexed. MOT_CHECK_MODE
// decides who can open it at all (see motCheckUsage.ts) - public by
// default. While the data comes from VDG, each new
// plate is a paid lookup, so the per-visitor and site-wide daily limits
// apply; a plate already checked today comes from the cache for free.
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { buildBreadcrumbJsonLd } from '@/lib/seo/breadcrumbs';
import { getAdminSession } from '@/lib/admin/session';
import { cleanRegistration } from '@/lib/mot/motRecord';
import { cachedMotLookup, freshMotLookup, type MotLookupResult } from '@/lib/mot/motCheckLookup';
import { motCheckMode, takeNewLookup, takeVisitorCheck, visitorAddress, MOT_CHECK_MESSAGES } from '@/lib/mot/motCheckUsage';
import { BUYING_GUIDE_REPORT_PRICE_LABEL } from '@/lib/payments/pricing';
import { isLikelyBot, recordFunnelStep } from '@/lib/analytics/funnel';
import { MotCheckResult } from './MotCheckResult';
import styles from './mot-check.module.css';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ vrm?: string }>;

const BASE_METADATA = pageMetadata({
  title: 'Free MOT History Check: Every Advisory Explained',
  description:
    'Check any UK car or motorcycle’s MOT history for free. Every advisory and failure explained in plain English, an MOT score, and what common repairs cost.',
  path: '/mot-check',
});

export async function generateMetadata(props: { searchParams: SearchParams }): Promise<Metadata> {
  const { vrm } = await props.searchParams;
  // Only the empty page is ever indexed, and only once it's public.
  const indexable = motCheckMode() === 'public' && !vrm;
  return { ...BASE_METADATA, robots: indexable ? undefined : { index: false, follow: false } };
}

const breadcrumbJsonLd = buildBreadcrumbJsonLd('Free MOT check', '/mot-check');

type Outcome =
  | { kind: 'none' }
  | { kind: 'invalid' }
  | { kind: 'limit'; message: string }
  | { kind: 'lookup'; result: MotLookupResult };

async function runCheck(rawVrm: string | undefined, isAdmin: boolean): Promise<Outcome> {
  if (rawVrm === undefined || rawVrm.trim() === '') return { kind: 'none' };
  const registration = cleanRegistration(rawVrm);
  if (!registration) return { kind: 'invalid' };

  if (!isAdmin) {
    const ip = visitorAddress((await headers()).get('x-forwarded-for'));
    if ((await takeVisitorCheck(ip)) !== 'ok') return { kind: 'limit', message: MOT_CHECK_MESSAGES.visitor_limit };
  }
  const cached = await cachedMotLookup(registration);
  if (cached) return { kind: 'lookup', result: cached };
  if (!isAdmin && (await takeNewLookup()) !== 'ok') return { kind: 'limit', message: MOT_CHECK_MESSAGES.site_limit };
  return { kind: 'lookup', result: await freshMotLookup(registration) };
}

export default async function MotCheckPage(props: { searchParams: SearchParams }) {
  const mode = motCheckMode();
  const isAdmin = mode !== 'off' && (await getAdminSession());
  if (mode === 'off' || (mode === 'admin' && !isAdmin)) notFound();

  const { vrm } = await props.searchParams;
  const outcome = await runCheck(vrm, isAdmin);
  // The top of the money funnel (analytics/funnel.ts): a result someone
  // can act on. Not the owner's own checks, and not crawlers.
  if (outcome.kind === 'lookup' && outcome.result.status === 'found' && !isAdmin && !isLikelyBot((await headers()).get('user-agent'))) {
    await recordFunnelStep('mot_result');
  }
  const shown = outcome.kind === 'lookup' && outcome.result.status === 'found' ? outcome.result.record.registration : (vrm ?? '').toUpperCase().replace(/\s+/g, '');

  return (
    <div className={`hero ${styles.page}`}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {mode === 'admin' ? <p className={styles.adminNote}>Admin preview - not public yet (MOT_CHECK_MODE=admin).</p> : null}
      <h1>Free MOT History Check</h1>
      <p className={styles.lead}>
        Any UK car or motorcycle. Every MOT test, every advisory and failure explained in plain
        English, and what the common repairs cost. Free, and no account needed.
      </p>

      <form action="/mot-check" method="get" className={styles.form} role="search">
        <label htmlFor="vrm" className={styles.formLabel}>
          Registration
        </label>
        <div className={styles.formRow}>
          <input
            id="vrm"
            name="vrm"
            className={styles.plateInput}
            defaultValue={shown}
            placeholder="AB12 CDE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={10}
            required
          />
          <button type="submit" className={styles.primary}>
            Check MOT history
          </button>
        </div>
      </form>

      {outcome.kind === 'invalid' ? (
        <p className={styles.notice} role="alert">That doesn’t look like a UK registration. Check it and try again.</p>
      ) : null}
      {outcome.kind === 'limit' ? <p className={styles.notice} role="alert">{outcome.message}</p> : null}
      {outcome.kind === 'lookup' && outcome.result.status === 'not_found' ? (
        <p className={styles.notice} role="alert">
          No MOT record found for {shown}. Check the registration - a vehicle under three years old
          won’t have had an MOT yet.
        </p>
      ) : null}
      {outcome.kind === 'lookup' && outcome.result.status === 'unavailable' ? (
        <p className={styles.notice} role="alert">The MOT check isn’t available right now. Please try again in a few minutes.</p>
      ) : null}
      {outcome.kind === 'lookup' && outcome.result.status === 'found' ? <MotCheckResult record={outcome.result.record} /> : null}

      {outcome.kind === 'none' ? (
        <section className={styles.about}>
          <h2>What you’ll see</h2>
          <ul>
            <li>Whether the MOT is valid, and when it runs out.</li>
            <li>Every test: pass or fail, the mileage, and each advisory and defect.</li>
            <li>What each one means, how serious it is, and what common repairs typically cost.</li>
            <li>A RoadVerdict MOT score that sums the record up, with the reasons.</li>
            <li>Whether the recorded mileage ever went down between tests.</li>
          </ul>
          <p>
            Got a garage quote for one of them? <Link href="/quote-checker">Check a motorcycle quote</Link> or{' '}
            <Link href="/cars/quote-checker">a car quote</Link>.
          </p>

          <h2>How to read an MOT history</h2>
          <p>Each test shows the date, the mileage and the result. Anything the tester found is graded:</p>
          <ul>
            <li><strong>Dangerous</strong> and <strong>Major</strong>: the vehicle failed, and the fault had to be fixed before it could pass.</li>
            <li><strong>Minor</strong>: it passed, but the fault was recorded.</li>
            <li>
              <strong>Advisory</strong>: it passed, but the tester saw something to keep an eye on, such as a tyre close
              to the legal limit or light corrosion.
            </li>
          </ul>
          <p>These grades have been used since May 2018. Older tests list failures and advisories.</p>
          <h3>What to look for</h3>
          <ul>
            <li><strong>The same advisory year after year.</strong> A worn tyre or corroded brake pipe that keeps coming back was probably never fixed.</li>
            <li>
              <strong>Mileage that goes down between tests.</strong> It can mean the clock was wound back, or simply a
              typing mistake at a test. Our check flags it. Ask the seller for receipts that show the mileage.
            </li>
            <li><strong>A long gap between tests.</strong> The vehicle may have been off the road. Ask the seller why.</li>
          </ul>

          <h2>When an MOT is due</h2>
          <p>
            In England, Scotland and Wales, a car or motorcycle needs its first MOT three years after it was first
            registered, then every year. You can have it tested up to a month (minus a day) before the current MOT runs
            out and keep the same renewal date. Driving without a valid MOT can mean a fine of up to £1,000.
          </p>

          <h2>What an MOT history doesn’t tell you</h2>
          <p>
            An MOT checks that the vehicle was roadworthy on the day of the test. It doesn’t check the engine, clutch or
            gearbox. And it says nothing about:
          </p>
          <ul>
            <li><strong>outstanding finance</strong> (a lender may still own it);</li>
            <li>whether an insurer <strong>wrote it off</strong>;</li>
            <li>whether it’s recorded as <strong>stolen</strong>.</li>
          </ul>
          <p>
            <strong>Buying it?</strong> The full history check covers all three, plus the keepers, plate changes and the
            mileage record.
          </p>
          <div className={styles.saveActions}>
            <Link className={styles.primary} href="/cars/buying-guide?src=mot">
              Full history check: car
            </Link>
            <Link className={styles.secondary} href="/buying-guide?src=mot">
              Full history check: motorbike
            </Link>
          </div>
          <p className={styles.buyingPrice}>
            {BUYING_GUIDE_REPORT_PRICE_LABEL.freeNoVehicle}, or {BUYING_GUIDE_REPORT_PRICE_LABEL.freeWithVehicle} once you’ve
            added a vehicle to a free account.
          </p>

          <h2>Common questions</h2>
          <h3>Is it really free?</h3>
          <p>
            Yes. The MOT history and the explanations are free, with no account. Only the full history check (finance,
            write-off, stolen) is paid.
          </p>
          <h3>Does it work for motorcycles?</h3>
          <p>Yes, for any UK car or motorcycle with an MOT record.</p>
          <h3>Why is there no MOT history?</h3>
          <p>
            A vehicle under three years old hasn’t needed an MOT yet, and many vehicles over 40 years old are exempt.
          </p>
        </section>
      ) : null}

      <p className="disclaimer" style={{ maxWidth: 'none' }}>
        MOT records come from DVSA. Contains public sector information licensed under the Open
        Government Licence v3.0. RoadVerdict is independent and isn’t connected to DVSA. The
        explanations and score are general guidance, not a mechanical inspection.
      </p>
    </div>
  );
}
