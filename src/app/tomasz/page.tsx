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
  getBrowserBreakdown,
  browserFamily,
} from '@/lib/admin/stats';
import { getSiteStats, type SiteStats } from '@/lib/monitoring/appInsights';
import { getAllAssistantQuestions, groupSimilarQuestions, type AssistantQuestionLogDoc } from '@/lib/tracker/assistantQuestionLog';
import { getAllUserEmails } from '@/lib/tracker/notification';
import styles from './tomasz.module.css';
import { RunCronButton } from './RunCronButton';
import { DeleteQuestionButton } from './DeleteQuestionButton';
import { ImpersonateButton } from './ImpersonateButton';
import { AdminLogoutButton } from './AdminLogoutButton';
import { SendNotificationForm } from './SendNotificationForm';

export const dynamic = 'force-dynamic';

const HOUR_OPTIONS = [
  { hours: 1, label: '1 hour' },
  { hours: 24, label: '24 hours' },
  { hours: 168, label: '7 days' },
];

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

// Guards against a Log Analytics hiccup taking down the whole admin page -
// every other section on /tomasz should keep working even if this one fails.
async function getSiteStatsSafe(hours: number): Promise<SiteStats | null> {
  try {
    return await getSiteStats(hours);
  } catch (err) {
    console.error('Failed to load site stats for /tomasz:', err);
    return null;
  }
}

// Same reasoning as getSiteStatsSafe above - this is a new query
// against a document type that's never run in production before, so
// it gets the same defensive treatment as everything else on this page.
async function getAssistantQuestionsSafe(): Promise<AssistantQuestionLogDoc[]> {
  try {
    return await getAllAssistantQuestions();
  } catch (err) {
    console.error('Failed to load assistant questions for /tomasz:', err);
    return [];
  }
}

// Same reasoning again - a new query against a document type this page
// hasn't touched before shouldn't be able to take down the send-
// notification section (or the rest of the page around it) if it fails.
async function getAllUserEmailsSafe(): Promise<string[]> {
  try {
    return await getAllUserEmails();
  } catch (err) {
    console.error('Failed to load user emails for /tomasz:', err);
    return [];
  }
}

function sparklinePoints(values: number[], width = 120, height = 32): string {
  if (values.length === 0) return '';
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((v, i) => `${(i * step).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');
}

function Sparkline({ values, danger }: { values: number[]; danger?: boolean }) {
  if (values.every((v) => v === 0)) return null;
  return (
    <svg viewBox="0 0 120 32" className={styles.sparkline} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={sparklinePoints(values)}
        fill="none"
        style={{ stroke: danger ? 'var(--verdict-red)' : 'var(--ink-soft)', strokeWidth: 1.5 }}
      />
    </svg>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: { hours?: string };
}) {
  const isAdmin = await getAdminSession();
  if (!isAdmin) redirect('/tomasz/login');

  const requestedHours = Number(searchParams?.hours);
  const windowHours = HOUR_OPTIONS.some((o) => o.hours === requestedHours) ? requestedHours : 24;

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
    browserBreakdown,
    siteStats,
    assistantQuestions,
    allUserEmails,
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
    getBrowserBreakdown(),
    getSiteStatsSafe(windowHours),
    getAssistantQuestionsSafe(),
    getAllUserEmailsSafe(),
  ]);
  const health = getServerHealth();
  const commonQuestions = groupSimilarQuestions(assistantQuestions);

  const trendRequests = siteStats?.trend.map((t) => t.requests) ?? [];
  const trendFailures = siteStats?.trend.map((t) => t.failures) ?? [];
  const trendFailureRate = siteStats?.trend.map((t) => (t.requests > 0 ? (t.failures / t.requests) * 100 : 0)) ?? [];
  const trendAvgMs = siteStats?.trend.map((t) => t.avgMs) ?? [];

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <h1 className={styles.heading}>Admin</h1>
        <AdminLogoutButton />
      </div>

      <p style={{ marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
        <a href="/privacy-draft">Privacy policy draft →</a>
      </p>

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

      <h2 className={styles.sectionHeading}>Traffic & performance</h2>
      <div className={styles.pillRow}>
        {HOUR_OPTIONS.map((o) => (
          <a
            key={o.hours}
            href={`/tomasz?hours=${o.hours}`}
            className={`${styles.pill} ${windowHours === o.hours ? styles.pillActive : ''}`}
          >
            {o.label}
          </a>
        ))}
      </div>
      {siteStats === null ? (
        <p className={styles.warn}>Couldn&apos;t load traffic stats right now - Application Insights may be unreachable. Rest of this page is unaffected.</p>
      ) : (
        <>
          <div className={styles.metricGrid}>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Total requests</div>
              <Sparkline values={trendRequests} />
              <div className={styles.metricValue}>{siteStats.totalRequests}</div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Failed requests</div>
              <Sparkline values={trendFailures} danger={siteStats.failedRequests > 0} />
              <div className={`${styles.metricValue} ${siteStats.failedRequests > 0 ? styles.metricValueDanger : ''}`}>
                {siteStats.failedRequests}
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Failure rate</div>
              <Sparkline values={trendFailureRate} danger={siteStats.failureRatePct > 0} />
              <div className={`${styles.metricValue} ${siteStats.failureRatePct > 0 ? styles.metricValueDanger : ''}`}>
                {siteStats.failureRatePct}%
              </div>
            </div>
            <div className={styles.metricCard}>
              <div className={styles.metricLabel}>Avg response time</div>
              <Sparkline values={trendAvgMs} />
              <div className={styles.metricValue}>{siteStats.avgResponseTimeMs}ms</div>
            </div>
          </div>

          {siteStats.byRoute.length > 0 && (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Requests</th>
                  <th>Avg ms</th>
                  <th>Failure rate</th>
                </tr>
              </thead>
              <tbody>
                {siteStats.byRoute.map((r) => (
                  <tr key={r.route}>
                    <td><span className={styles.routeCell} title={r.route}>{r.route}</span></td>
                    <td>{r.requests}</td>
                    <td>{r.avgDurationMs}</td>
                    <td>
                      <span className={`${styles.badge} ${r.failureRatePct > 0 ? styles.badgeDanger : styles.badgeOk}`}>
                        {r.failureRatePct}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {siteStats.topExceptions.length > 0 && (
            <>
              <div className={styles.statusTitle} style={{ marginTop: '1rem' }}>Top exceptions</div>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Message</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {siteStats.topExceptions.map((e, i) => (
                    <tr key={i}>
                      <td>{e.type}</td>
                      <td>{e.message}</td>
                      <td>{e.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </>
      )}

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
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Purge orphaned receipt requests</div>
          <p className={styles.warn} style={{ marginBottom: '0.4rem' }}>
            Deletes any receipt request left behind by a shareable link that no longer exists - this backlog only
            exists because deleting or expiring a link didn&apos;t used to take its requests with it. New deletes
            and expiries now cascade automatically, so this is a one-off catch-up, not something to schedule.
            Safe to click more than once - finds nothing once the backlog is clear.
          </p>
          <RunCronButton name="purge-orphaned-receipt-requests" label="Run purge" />
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Accounts</h2>
      <div className={styles.statusGrid}>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Total registered users</div>
          <p className={styles.metricValue}>{totalUsers}</p>
        </div>
        <div className={styles.statusCard}>
          <div className={styles.statusTitle}>Active sessions right now</div>
          <p className={styles.metricValue}>{activeSessions}</p>
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

      <h2 className={styles.sectionHeading}>Notifications</h2>
      <SendNotificationForm allEmails={allUserEmails} />

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

      <h2 className={styles.sectionHeading}>Browser breakdown (aggregate - not tied to any individual session below)</h2>
      {browserBreakdown.length === 0 ? (
        <p className={styles.warn}>No sessions recorded.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Browser</th>
              <th>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {browserBreakdown.map((b) => (
              <tr key={b.browser}>
                <td>{b.browser}</td>
                <td>{b.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>Recent logins (last 50)</h2>
      <p className={styles.warn} style={{ marginBottom: '0.6rem' }}>
        IP and browser capture were only added partway through development - both will show as &quot;-&quot; for
        any login before that point, genuinely absent, not a display bug.
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
              <th>Browser</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentSessions.map((s, i) => (
              <tr key={i}>
                <td>{s.email}</td>
                <td>{fmtDate(s.createdAt)}</td>
                <td>{s.ip ?? '-'}</td>
                <td>{s.userAgent ? browserFamily(s.userAgent) : '-'}</td>
                <td><ImpersonateButton email={s.email} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>AI Assistant Questions</h2>
      <p style={{ marginBottom: '0.6rem' }}>
        {assistantQuestions.length} question{assistantQuestions.length === 1 ? '' : 's'} logged in total.
      </p>
      <p className={styles.warn} style={{ marginBottom: '0.6rem' }}>
        Signed-in questions are linked to the account that asked them - this isn&apos;t covered
        in the privacy policy yet, see the note in assistantQuestionLog.ts.
      </p>
      <p className={styles.warn} style={{ marginBottom: '0.6rem' }}>
        &quot;Most common&quot; below is an exact-match count on normalized text, not real theme
        clustering - &quot;when&apos;s my MOT due&quot; and &quot;MOT due date&quot; count as two
        different questions despite meaning the same thing. Treat this as a signal to skim the
        raw list below for real patterns, not as a definitive ranking.
      </p>
      {commonQuestions.length === 0 ? (
        <p className={styles.warn}>No questions logged yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Question (normalized)</th>
              <th>Times asked</th>
            </tr>
          </thead>
          <tbody>
            {commonQuestions.map((q, i) => (
              <tr key={i}>
                <td>{q.text}</td>
                <td>{q.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h3 style={{ marginTop: '1.2rem', marginBottom: '0.6rem' }}>Most recent</h3>
      {assistantQuestions.length === 0 ? (
        <p className={styles.warn}>No questions logged yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Asked</th>
              <th>Question</th>
              <th>Asked by</th>
              <th>Result</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {assistantQuestions.slice(0, 100).map((q) => (
              <tr key={q.id}>
                <td>{fmtDate(q.askedAt)}</td>
                <td>{q.question}</td>
                <td>{q.email ?? (q.signedIn ? 'Signed in (no email captured)' : 'Anonymous')}</td>
                <td style={q.hadError ? { color: 'var(--verdict-red)' } : undefined}>{q.hadError ? 'Error' : 'Answered'}</td>
                <td><DeleteQuestionButton id={q.id} /></td>
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
