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
  getServerHealth,
  getCosmosContainerInfo,
  getDetailedCounts,
  getBikeIdBackfillStatus,
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

function fmtUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default async function AdminDashboardPage() {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect('/tomasz/login');

  const [
    dbStats,
    activeSessions,
    fuelStatus,
    reminderStatus,
    totalUsers,
    magicLinkRequests,
    recentSessions,
    cosmosInfo,
    detailedCounts,
    bikeIdBackfillStatus,
  ] = await Promise.all([
    getDbStats(),
    getActiveSessionCount(),
    getFuelPriceStatus(),
    getReminderCronStatus(),
    getTotalUserCount(),
    getMagicLinkRequests(),
    getRecentSessions(50),
    getCosmosContainerInfo(),
    getDetailedCounts(),
    getBikeIdBackfillStatus(),
  ]);
  const health = getServerHealth();

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Admin</h1>
        <AdminLogoutButton />
      </div>

      <h2 className={styles.sectionHeading}>Server & hosting</h2>
      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>This instance</div>
          <p>Site: {health.siteName}</p>
          <p>Host: {health.hostname}</p>
          <p>Region: {health.region}</p>
          <p>Resource group: {health.resourceGroup}</p>
          <p>Instance ID: {health.instanceId}</p>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Runtime health</div>
          <p>Uptime: {fmtUptime(health.uptimeSeconds)}</p>
          <p>Node version: {health.nodeVersion}</p>
          <p>Environment: {health.nodeEnv}</p>
          <p>Memory: {health.memoryUsedMB}MB / {health.memoryTotalMB}MB</p>
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Scheduled jobs</h2>
      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Fuel price (weekly)</div>
          {fuelStatus ? (
            <p>Week commencing {fuelStatus.weekCommencing} · {fuelStatus.pricePenceLitre}p/litre</p>
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
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Delete expired share links (daily)</div>
          <p>Permanently removes any shareable report link past its expiry date.</p>
          <RunCronButton name="delete-expired-share-links" label="Run now" />
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Migrations (one-time, safe to re-run)</h2>
      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Bike-ID backfill</div>
          <p className={styles.warn} style={{ marginBottom: '0.4rem' }}>
            Tags every existing service/fuel/mods/bills/reminder record with its bike&apos;s ID, ahead of multi-bike
            support. Does nothing to records already tagged - safe to click more than once.
          </p>
          {bikeIdBackfillStatus ? (
            <p>
              Last run {fmtDate(bikeIdBackfillStatus.lastRunAt)} · {bikeIdBackfillStatus.bikesProcessed} bike(s) ·{' '}
              {bikeIdBackfillStatus.docsPatched} record(s) patched
              {bikeIdBackfillStatus.shareLinksPatched != null && ` · ${bikeIdBackfillStatus.shareLinksPatched} share link(s) patched`}
            </p>
          ) : (
            <p className={styles.warn}>Not run yet.</p>
          )}
          <RunCronButton name="backfill-bike-id" label="Run backfill" />
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Mileage audit</div>
          <p className={styles.warn} style={{ marginBottom: '0.4rem' }}>
            Re-flags any AI-derived mileage that breaks chronological ordering against its own neighbouring records
            (mileage can only go up over time), or where a full-tank fill-up&apos;s litres imply an impossible mpg
            against the fill before it - catches records damaged by earlier estimator bugs, including ones
            already marked &quot;confirmed&quot;. Never changes the mileage value itself, only re-flags it for review.
            Safe to click more than once.
          </p>
          <RunCronButton name="audit-mileage" label="Run audit" />
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
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Magic links</div>
          <p>Used: {detailedCounts.usedMagicLinks}</p>
          <p>Requested but never clicked: {detailedCounts.unusedMagicLinks}</p>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Sessions</div>
          <p>Active: {activeSessions}</p>
          <p>Expired (still stored): {detailedCounts.expiredSessions}</p>
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
        IP capture was only added partway through development - it will show as &quot;-&quot; for any login before
        that point, genuinely absent, not a display bug.
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
      {cosmosInfo && (
        <p style={{ marginBottom: '0.6rem' }}>
          Partition key: <code>{cosmosInfo.partitionKeyPath}</code> · Indexing: {cosmosInfo.indexingMode}
          {cosmosInfo.defaultTtl != null && ` · Default TTL: ${cosmosInfo.defaultTtl}s`}
        </p>
      )}
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
