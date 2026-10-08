// Place at: src/app/pro/page.tsx
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { getSession } from '@/lib/auth/session';
import { isPro, PRO_MONTHLY_PRICE } from '@/lib/subscriptions';
import { EXTRA_VEHICLE_MONTHLY_PRICE, PRO_TRIAL_DAYS } from '@/lib/proPlan';
import { getUserDoc } from '@/lib/tracker/userDoc';
import { selfHealProSubscription } from '@/lib/payments/proSubscription';
import { isEligibleForProTrial } from '@/lib/payments/proTrial';
import { FunnelBeacon } from '@/components/FunnelBeacon';
import { PlanComparisonCards } from '@/components/PlanComparisonCards';
import styles from './pro.module.css';

export const metadata: Metadata = pageMetadata({
  title: 'RoadVerdict Pro: Plans and Pricing',
  description:
    (PRO_TRIAL_DAYS > 0 ? `Try RoadVerdict Pro free for ${PRO_TRIAL_DAYS} days: ` : 'RoadVerdict Pro: ') +
    'a second vehicle, full reports, exact reminder dates and emails, the encrypted Vault, AI summaries and a free full vehicle history check every 4 weeks.',
  path: '/pro',
  absoluteTitle: true,
});

export default async function ProPage(props: { searchParams: Promise<{ session_id?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await getSession();

  // Covers the case where the browser returns from Stripe before the
  // webhook has landed - see selfHealProSubscription's own comment. The
  // webhook remains the authoritative path either way.
  if (session && searchParams.session_id) {
    await selfHealProSubscription(session.email, searchParams.session_id);
  }

  const userIsPro = session ? await isPro(session.email) : false;
  const userDoc = session ? await getUserDoc(session.email) : null;
  const hasStripeSubscription = !!userDoc?.stripeSubscriptionId;
  // The trial a signed-in visitor would actually get; unknown (undefined)
  // when signed out, which shows the general "new to Pro" line.
  const trialDays = session ? (!userIsPro && isEligibleForProTrial(userDoc) ? PRO_TRIAL_DAYS : 0) : undefined;

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>RoadVerdict Pro</p>
        <h1 className={styles.heading}>Own your bike&apos;s full story.</h1>
        <p className={styles.sub}>
          The free plan is a genuine tracker. Pro is for riders who want
          deeper insight, multiple bikes, and polished outputs when it matters.
        </p>
        <p className={styles.sub}>
          One subscription, {PRO_MONTHLY_PRICE}/month - it unlocks every Pro feature below together, not one at a time.
        </p>
        <p className={styles.sub}>
          Pro includes a full vehicle history check every 4 weeks - the kind that costs up to £20 elsewhere. One check
          alone is worth more than a month of Pro.
        </p>
      </div>

      <PlanComparisonCards userIsPro={userIsPro} hasStripeSubscription={hasStripeSubscription} trialDays={trialDays} />

      <div className={styles.faq}>
        <h2 className={styles.faqHeading}>Common questions</h2>
        <div className={styles.faqItem}>
          <strong>Will my free data stay?</strong>
          <p>Yes. Everything you&apos;ve logged stays exactly as it is, on any plan.</p>
        </div>
        <div className={styles.faqItem}>
          <strong>Can I cancel Pro?</strong>
          <p>Yes, at any time. You keep Pro access until the end of the billing period.</p>
        </div>
        <div className={styles.faqItem}>
          <strong>What happens to my second bike if I cancel Pro?</strong>
          <p>It becomes read-only - you can still view your history, just not add new entries until you resubscribe or remove a bike.</p>
        </div>
        <div className={styles.faqItem}>
          <strong>Can I track more than two vehicles?</strong>
          <p>
            Yes - up to four. Each vehicle past Pro&apos;s two is {EXTRA_VEHICLE_MONTHLY_PRICE}/month, added from your garage once
            it&apos;s full. Extra vehicles end when Pro does.
          </p>
        </div>
        <div className={styles.faqItem}>
          <strong>Is there a trial?</strong>
          {PRO_TRIAL_DAYS > 0 ? (
            <p>
              Yes - your first {PRO_TRIAL_DAYS} days of Pro are free, once per account. You add a card at checkout, but
              nothing is charged until the trial ends. We email you a week before it does, and if you cancel before then
              (Manage billing, on this page) you pay nothing. The free vehicle history check starts with your first
              payment.
            </p>
          ) : (
            <p>Not at the moment - but at {PRO_MONTHLY_PRICE}/month you can try it for a month and cancel if it&apos;s not for you.</p>
          )}
        </div>
      </div>
      <FunnelBeacon step="pro" />
    </main>
  );
}
