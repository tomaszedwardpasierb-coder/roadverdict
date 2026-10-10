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
