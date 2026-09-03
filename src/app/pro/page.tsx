// Place at: src/app/pro/page.tsx
import Link from 'next/link';
import { getSession } from '@/lib/auth/session';
import { isPro, PRO_FEATURES } from '@/lib/subscriptions';
import styles from './pro.module.css';

export const metadata = {
  title: 'RoadVerdict Pro',
  description: 'Upgrade to RoadVerdict Pro for multi-bike tracking, AI summaries, CSV export, and more.',
};

export default async function ProPage() {
  const session = await getSession();
  const userIsPro = session ? await isPro(session.email) : false;

  return (
    <main className={styles.main}>
      <div className={styles.hero}>
        <p className={styles.eyebrow}>RoadVerdict Pro</p>
        <h1 className={styles.heading}>Own your bike&apos;s full story.</h1>
        <p className={styles.sub}>
          The free plan is a genuine tracker. Pro is for riders who want
          deeper insight, multiple bikes, and polished outputs when it matters.
        </p>
      </div>

      <div className={styles.plans}>
        {/* Free */}
        <div className={styles.planCard}>
          <div className={styles.planName}>Free</div>
          <div className={styles.planPrice}>£0</div>
          <div className={styles.planPriceSub}>forever</div>
          <ul className={styles.featureList}>
            <li>1 bike</li>
            <li>Service, fuel, mods &amp; bills logging</li>
            <li>Receipt scanning (one at a time)</li>
            <li>Reminders (OK/overdue status - exact dates are Pro)</li>
            <li>Total spend &amp; current mileage at a glance</li>
            <li>Basic history timeline</li>
            <li>Shareable buyer report link</li>
          </ul>
          <Link href="/dashboard" className={styles.planCta + ' ' + styles.planCtaSecondary}>
            Go to dashboard
          </Link>
        </div>

        {/* Pro */}
        <div className={styles.planCard + ' ' + styles.planCardPro}>
          <div className={styles.planBadge}>Most popular</div>
          <div className={styles.planName}>Pro</div>
          <div className={styles.planPrice}>£4.99<span className={styles.planPricePer}>/mo</span></div>
          <div className={styles.planPriceSub}>or £49/year (2 months free)</div>
          <ul className={styles.featureList}>
            <li>Everything in Free, plus:</li>
            {PRO_FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {/* Real per-account Premium now (see isPro() in
              subscriptions.ts) - granted manually by the admin from
              /tomasz until a real payment platform is wired in. There's
              no self-serve checkout yet, so a non-Premium visitor sees
              a disabled "Coming soon" state rather than a purchase flow
              that doesn't actually exist. Replace this whole branch
              with a real Stripe (or other platform) checkout link once
              one exists. */}
          {userIsPro ? (
            <>
              <div className={styles.planCta + ' ' + styles.planCtaPro} style={{ cursor: 'default' }}>
                You&apos;re on Premium
              </div>
              <p className={styles.planCtaNote}>Your account already has full Premium access.</p>
            </>
          ) : (
            <>
              <button type="button" className={styles.planCta + ' ' + styles.planCtaPro} disabled>
                Coming soon
              </button>
              <p className={styles.planCtaNote}>
                Pro isn&apos;t available to purchase yet. Your data is safe and your account is ready.
              </p>
            </>
          )}
        </div>
      </div>

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
          <p>It becomes read-only — you can still view your history, just not add new entries until you resubscribe or remove a bike.</p>
        </div>
        <div className={styles.faqItem}>
          <strong>Is there a trial?</strong>
          <p>Not yet — but at £4.99/month you can try it for a month and cancel if it&apos;s not for you.</p>
        </div>
      </div>
    </main>
  );
}
