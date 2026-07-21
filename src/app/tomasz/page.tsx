// Place at: src/app/tomasz/page.tsx
import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/admin/session';
import { getDbStats, getActiveSessionCount, getFuelPriceStatus, getReminderCronStatus } from '@/lib/admin/stats';
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

  const [dbStats, activeSessions, fuelStatus, reminderStatus] = await Promise.all([
    getDbStats(),
    getActiveSessionCount(),
    getFuelPriceStatus(),
    getReminderCronStatus(),
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

      <h2 className={styles.sectionHeading}>Database</h2>
      <p>
        Active sessions right now: <strong>{activeSessions}</strong>
      </p>
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
