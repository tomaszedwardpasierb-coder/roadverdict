// Place at: src/app/pro/page.tsx
import { getSession } from '@/lib/auth/session';
import { isPro } from '@/lib/subscriptions';
import { PlanComparisonCards } from '@/components/PlanComparisonCards';
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
        <p className={styles.sub}>
          One subscription, £4.99/month - it unlocks every Pro feature below together, not one at a time.
        </p>
      </div>

      <PlanComparisonCards userIsPro={userIsPro} />

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
          <strong>Is there a trial?</strong>
          <p>Not yet - but at £4.99/month you can try it for a month and cancel if it&apos;s not for you.</p>
        </div>
      </div>
    </main>
  );
}
