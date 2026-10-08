// Place at: src/app/tomasz/SignInHealthPanel.tsx
//
// Sign-in health for /tomasz: the Android app's emailed codes over the last 24
// hours - how many were requested, how many were entered, and who asked and
// never got in (the sign that an email didn't arrive). Worked out in
// admin/signInEvents.ts from a small record kept for 30 days.
import { formatAgo } from '@/lib/admin/testerReport';
import type { SignInHealth } from '@/lib/admin/signInEvents';
import styles from './adminShell.module.css';

export function SignInHealthPanel({ health, now }: { health: SignInHealth | null; now: Date }) {
  if (health === null) {
    return <p className={styles.warnNote}>Couldn&apos;t load the sign-in records just now. The rest of this page is unaffected.</p>;
  }

  const waiting = health.stuck.filter((s) => s.stillValid && !s.sendFailed).length;
  const needAttention = health.stuck.length - waiting;

  return (
    <>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Codes requested</div>
          <div className={styles.metricValue}>{health.requested}</div>
          <div className={styles.note}>{health.people} {health.people === 1 ? 'person' : 'people'}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Codes entered (signed in)</div>
          <div className={styles.metricValue}>{health.entered}</div>
          <div className={styles.note}>{health.signedIn} {health.signedIn === 1 ? 'person' : 'people'}</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Wrong or expired codes typed</div>
          <div className={styles.metricValue}>{health.wrong + health.expired}</div>
          <div className={styles.note}>{health.wrong} wrong, {health.expired} expired or used</div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Emails refused by the email service</div>
          <div className={`${styles.metricValue} ${health.sendFailed > 0 ? styles.metricValueDanger : ''}`}>{health.sendFailed}</div>
          <div className={styles.note}>the code never left</div>
        </div>
      </div>

      <div style={{ margin: '0.9rem 0' }}>
        {health.status === 'problem' && (
          <p className={styles.warnNote}>
            <strong>Problem:</strong> the email service refused {health.sendFailed} sign-in {health.sendFailed === 1 ? 'email' : 'emails'} in the last {health.windowHours} hours, so
            those people never received a code. Check the addresses below and the email service dashboard.
          </p>
        )}
        {health.status === 'watch' && (
          <p className={styles.warnNote}>
            <strong>Worth a look:</strong>{' '}
            {needAttention === 1
              ? "1 person asked for a code more than 10 minutes ago and hasn't signed in since."
              : `${needAttention} people asked for a code more than 10 minutes ago and haven't signed in since.`}{' '}
            The email may not have arrived (ask them to check spam), or they gave up.
          </p>
        )}
        {health.status === 'ok' && (
          <p className={styles.note}>
            <span className={`${styles.badge} ${styles.badgeOk}`}>All good</span>{' '}
            {health.people === 0
              ? `No one asked for a code in the last ${health.windowHours} hours.`
              : `Everyone who asked for a code in the last ${health.windowHours} hours has signed in${waiting > 0 ? ` (${waiting} still within the code's 10 minutes)` : ''}.`}
          </p>
        )}
      </div>

      {health.stuck.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Asked for a code</th>
                <th>When</th>
                <th>What happened</th>
                <th>Wrong tries since</th>
              </tr>
            </thead>
            <tbody>
              {health.stuck.map((s) => (
                <tr key={s.email}>
                  <td className={styles.mono}>{s.email}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatAgo(s.requestedAt, now)}</td>
                  <td>
                    {s.sendFailed ? (
                      <span className={`${styles.badge} ${styles.badgeDanger}`}>Email refused</span>
                    ) : s.stillValid ? (
                      <span className={styles.badge}>Waiting (code still valid)</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.badgeDanger}`}>Hasn&apos;t signed in</span>
                    )}
                  </td>
                  <td>{s.failedTries}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.note} style={{ marginTop: '0.7rem' }}>
        Counts the app&apos;s emailed codes only (website sign-in links aren&apos;t included), from when this recording began. The demo account used by store reviewers is left out.
      </p>
    </>
  );
}
