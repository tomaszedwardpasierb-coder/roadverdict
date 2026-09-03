// Place at: src/components/PlanComparisonCards.tsx
//
// The Free vs Pro comparison shown on /pro. Extracted so ProGate can show
// the exact same side-by-side cards inline wherever a feature is locked -
// one Pro subscription unlocks everything below, not just the feature
// being gated at that spot.
import Link from 'next/link';
import { PRO_FEATURES } from '@/lib/subscriptions';
import styles from '@/app/pro/pro.module.css';

interface Props {
  // Whether the signed-in viewer already has Pro - drives the Pro card's
  // own CTA state (see /pro's own comment on why there's no real
  // checkout yet).
  userIsPro: boolean;
  // The Free card's "Go to dashboard" link only makes sense on the
  // standalone /pro page - pointless when this is already rendered
  // inside the dashboard itself.
  showFreeCta?: boolean;
}

export function PlanComparisonCards({ userIsPro, showFreeCta = true }: Props) {
  return (
    <div className={styles.plans}>
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
        {showFreeCta && (
          <Link href="/dashboard" className={styles.planCta + ' ' + styles.planCtaSecondary}>
            Go to dashboard
          </Link>
        )}
      </div>

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
  );
}
