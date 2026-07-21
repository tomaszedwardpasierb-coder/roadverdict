// Place at: src/app/tomasz/page.tsx
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin/session';
import {
  getDbStats,
  getActiveSessionCount,
  getFuelPriceStatus,
  getReminderCronStatus,
  getTotalUserCount,
  getMagicLinkRequests,
  getRecentSessions,
} from '@/lib/admin/stats';
import styles from './tomasz.module.css';
import { RunCronButton } from './RunCronButton';
import { AdminLogoutButton } from './AdminLogoutButton';

export const dynamic = 'force-dynamic';

function fmtDate(d: string): string {
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function AdminDashboardPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect('/tomasz/login');

  const [dbStats, activeSessions, fuelStatus, reminderStatus, totalUsers, magicLinkRequests, recentSessions] =
    await Promise.all([
      getDbStats(),
      getActiveSessionCount(),
      getFuelPriceStatus(),
      getReminderCronStatus(),
      getTotalUserCount(),
      getMagicLinkRequests(),
      getRecentSessions(50),
    ]);

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Admin</h1>
        <AdminLogoutButton />
      </div>

      <h2 className={styles.sectionHeading}>Scheduled jobs</h2>
      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Fuel price (weekly)</div>
          {fuelStatus ? (
            <p>
              Week commencing {fuelStatus.weekCommencing} · {fuelStatus.pricePenceLitre}p/litre
            </p>
          ) : (
            <p className={styles.warn}>No record found - has this ever run successfully?</p>
          )}
          <RunCronButton name="update-fuel-price" label="Run now" />
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Reminder check (daily)</div>
          {reminderStatus ? (
            <p>
              Last run {fmtDate(reminderStatus.lastRunAt)} · checked {reminderStatus.checked}, sent{' '}
              {reminderStatus.sent}
            </p>
          ) : (
            <p className={styles.warn}>No record found - has this ever run successfully?</p>
          )}
          <RunCronButton name="check-reminders" label="Run now" />
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Accounts</h2>
      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Total registered users</div>
          <p style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{totalUsers}</p>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Active sessions right now</div>
          <p style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{activeSessions}</p>
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Magic link requests (every email, ever - including ones that never completed sign-in)</h2>
      {magicLinkRequests.length === 0 ? (
        <p className={styles.warn}>No magic link requests recorded.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Times requested</th>
              <th>Last requested</th>
            </tr>
          </thead>
          <tbody>
            {magicLinkRequests.map((r) => (
              <tr key={r.email}>
                <td>{r.email}</td>
                <td>{r.requestCount}</td>
                <td>{fmtDate(r.lastRequestedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>Recent logins (last 50)</h2>
      <p className={styles.warn} style={{ marginBottom: '0.6rem' }}>
        IP capture was only just added - it will show as &quot;-&quot; for any login before today,
        genuinely absent, not a display bug.
      </p>
      {recentSessions.length === 0 ? (
        <p className={styles.warn}>No sessions recorded.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Signed in</th>
              <th>IP address</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((s, i) => (
              <tr key={i}>
                <td>{s.email}</td>
                <td>{fmtDate(s.createdAt)}</td>
                <td>{s.ip ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>Database</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Document type</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          {dbStats.map((s) => (
            <tr key={s.type}>
              <td>{s.type}</td>
              <td>{s.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
