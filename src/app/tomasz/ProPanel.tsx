// Place at: src/app/tomasz/ProPanel.tsx
//
// Pro subscriptions read live from Stripe (lib/payments/proStats.ts) -
// who's paying, who's in a free trial, and the last 30 days' trials,
// conversions and renewals.
import { getProStats, type ProStats } from '@/lib/payments/proStats';
import styles from './adminShell.module.css';

export async function ProPanel() {
  let stats: ProStats;
  try {
    stats = await getProStats();
  } catch {
    return <p className={styles.warnNote}>Couldn&apos;t reach Stripe to load Pro subscriptions.</p>;
  }

  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Paying for Pro now</div>
        <p className={styles.metricValue}>{stats.payingMonthly + stats.payingAnnual}</p>
        <p className={styles.note}>
          Monthly {stats.payingMonthly} &middot; annual {stats.payingAnnual}
        </p>
        <p className={styles.note}>Set to end at period end: {stats.payingCancelling}</p>
        {stats.paymentFailing > 0 && <p className={styles.warnNote}>Payment failing, Stripe retrying: {stats.paymentFailing}</p>}
      </div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>In a free trial now</div>
        <p className={styles.metricValue}>{stats.inTrial}</p>
        <p className={styles.note}>Set to end without paying: {stats.trialsCancelling}</p>
      </div>
      <div className={styles.card}>
        <div className={styles.cardTitle}>Last 30 days</div>
        <p className={styles.note}>
          Subscriptions started: {stats.started} (with a trial: {stats.trialsStarted})
        </p>
        <p className={styles.note}>Trials that became paid: {stats.trialsConverted}</p>
        <p className={styles.note}>Trials that ended unpaid: {stats.trialsEndedUnpaid}</p>
        <p className={styles.note}>Renewal payments (including first payments after a trial): {stats.renewalPayments}</p>
        <p className={styles.note}>Subscriptions ended: {stats.ended}</p>
      </div>
    </div>
  );
}
