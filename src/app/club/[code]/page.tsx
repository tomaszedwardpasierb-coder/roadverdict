// Place at: src/app/club/[code]/page.tsx
//
// A club's member offer (see lib/clubOffers.ts): 3 months of Pro free, then
// 10% off. Linked only from the club's own members' page or newsletter, so
// it's kept out of search results and the sitemap, and never linked from
// the app. An unknown code is a plain 404.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { isPro, PRO_MONTHLY_PRICE } from '@/lib/subscriptions';
import { PRO_ANNUAL_PRICE, PRO_FEATURES } from '@/lib/proPlan';
import { getUserDoc } from '@/lib/tracker/userDoc';
import { proTrialDaysFor } from '@/lib/payments/proTrial';
import { BUYING_GUIDE_REPORT_PRICE_PENCE } from '@/lib/payments/pricing';
import {
  CLUB_ANNUAL_PRICE,
  CLUB_DISCOUNT_PERCENT,
  CLUB_MONTHLY_PRICE,
  CLUB_TRIAL_DAYS,
  CLUB_TRIAL_LABEL,
  clubPath,
  findClubOffer,
} from '@/lib/clubOffers';
import { ProSubscribeButtons, ManageBillingButton } from '@/components/ProCheckoutButtons';
import styles from '@/app/pro/pro.module.css';

type Props = { params: Promise<{ code: string }> };

const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`;

export async function generateMetadata(props: Props): Promise<Metadata> {
  const club = findClubOffer((await props.params).code);
  return {
    title: club ? `RoadVerdict Pro for members of ${club.name}` : 'Club offer',
    robots: { index: false, follow: true },
  };
}

export default async function ClubOfferPage(props: Props) {
  const club = findClubOffer((await props.params).code);
  if (!club) notFound();

  const session = await getSession();
  const userIsPro = session ? await isPro(session.email) : false;
  const userDoc = session ? await getUserDoc(session.email) : null;
  const trialDays = session && !userIsPro ? proTrialDaysFor(userDoc, club) : 0;
  const signInHref = `/login?redirect=${encodeURIComponent(clubPath(club))}&src=partner`;

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>Member offer</p>
        <h1 className={styles.heading}>RoadVerdict Pro for members of {club.name}</h1>
        <p className={styles.sub}>
          {CLUB_TRIAL_LABEL} of Pro free, then {CLUB_DISCOUNT_PERCENT}% off for as long as you stay.
        </p>
      </div>

      <div className={styles.plans}>
        <div className={styles.planCard + ' ' + styles.planCardPro}>
          <div className={styles.planName}>Your member offer</div>
          <ul className={styles.featureList}>
            <li>
              <strong>{CLUB_TRIAL_LABEL} ({CLUB_TRIAL_DAYS} days) of Pro free.</strong> You add a card, but nothing is
              charged until the free months end. We email you a week before, and you can cancel any time before then.
            </li>
            <li>
              <strong>Then {CLUB_DISCOUNT_PERCENT}% off:</strong> {CLUB_MONTHLY_PRICE} a month or {CLUB_ANNUAL_PRICE} a
              year, instead of {PRO_MONTHLY_PRICE} or {PRO_ANNUAL_PRICE}.
            </li>
            <li>
              <strong>The full history check for {pounds(BUYING_GUIDE_REPORT_PRICE_PENCE.pro)}</strong> instead of{' '}
              {pounds(BUYING_GUIDE_REPORT_PRICE_PENCE.freeWithVehicle)} while you&apos;re on Pro, including the free
              months: outstanding finance, stolen and write-off records for a vehicle you&apos;re thinking of buying.
              Pro&apos;s free check every 4 weeks starts with your first payment.
            </li>
            <li>Pro works on the website and in the RoadVerdict app, signed in with the same email.</li>
          </ul>

          {!session ? (
            <>
              <p className={styles.planCtaNote} style={{ marginTop: 0 }}>
                First, sign in or create a free account. There&apos;s no password: we email you a sign-in link, and it
                brings you back here.
              </p>
              <Link href={signInHref} className={styles.planCta + ' ' + styles.planCtaPro}>
                Sign in or create a free account
              </Link>
            </>
          ) : userIsPro ? (
            <>
              <p className={styles.planCtaNote} style={{ marginTop: 0 }}>
                Your account already has Pro, so there&apos;s nothing to claim.
              </p>
              {userDoc?.stripeSubscriptionId && <ManageBillingButton />}
            </>
          ) : (
            <>
              {trialDays === 0 && (
                <p className={styles.planCtaNote} style={{ marginTop: 0 }}>
                  You&apos;ve had a Pro trial or subscription on this account before, so the free months don&apos;t
                  apply, but the {CLUB_DISCOUNT_PERCENT}% off does.
                </p>
              )}
              <ProSubscribeButtons trialDays={trialDays} club={club.code} />
            </>
          )}
        </div>

        <div className={styles.planCard}>
          <div className={styles.planName}>What&apos;s in Pro</div>
          <ul className={styles.featureList}>
            {PRO_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className={styles.faq}>
        <div className={styles.faqItem}>
          <strong>Do I have to keep Pro?</strong>
          <p>
            No. Cancel any time from the <Link href="/pro">Pro page</Link> (Manage billing). Everything you&apos;ve
            logged stays yours on the free plan.
          </p>
        </div>
      </div>
    </main>
  );
}
