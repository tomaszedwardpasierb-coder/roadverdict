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
  getUserBackfillStatus,
  getSeedAssistantConfigStatus,
  getBrowserBreakdown,
  browserFamily,
} from '@/lib/admin/stats';
import { getSiteStats, type SiteStats } from '@/lib/monitoring/appInsights';
import { getAllAssistantQuestions, groupSimilarQuestions, type AssistantQuestionLogDoc } from '@/lib/tracker/assistantQuestionLog';
import { getAllUserEmails, getBroadcastSummaries, type BroadcastSummary } from '@/lib/tracker/notification';
import { getAssistantConfig } from '@/lib/tracker/assistantConfig';
import { getAllUserAccounts } from '@/lib/tracker/userAccount';
import { getGeminiUsageByTask, type GeminiUsageByTask } from '@/lib/tracker/geminiUsageLog';
import type { UserDoc } from '@/lib/tracker/userDoc';
import { AdminShell } from './AdminShell';
import { KnowledgeBaseEditor } from './KnowledgeBaseEditor';
import styles from './adminShell.module.css';
import { RunCronButton } from './RunCronButton';
import { AssistantQuestionsTable } from './AssistantQuestionsTable';
import { ImpersonateButton } from './ImpersonateButton';
import { AdminLogoutButton } from './AdminLogoutButton';
import { SendNotificationForm } from './SendNotificationForm';
import { ClearNotificationsForm } from './ClearNotificationsForm';
import { BlockAccountButton } from './BlockAccountButton';
import { GrantPremiumForm } from './GrantPremiumForm';
import { DeleteAccountButton } from './DeleteAccountButton';
import { ResetStoryCooldownButton } from './ResetStoryCooldownButton';
import { RevokeSessionsButton } from './RevokeSessionsButton';

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

async function getAllUserAccountsSafe(): Promise<UserDoc[]> {
  try {
    return await getAllUserAccounts();
  } catch (err) {
    console.error('Failed to load user accounts for /tomasz:', err);
    return [];
  }
}

async function getGeminiUsageByTaskSafe(): Promise<GeminiUsageByTask[]> {
  try {
    return await getGeminiUsageByTask();
  } catch (err) {
    console.error('Failed to load Gemini usage for /tomasz:', err);
    return [];
  }
}

async function getBroadcastSummariesSafe(): Promise<BroadcastSummary[]> {
  try {
    return await getBroadcastSummaries();
  } catch (err) {
    console.error('Failed to load broadcast summaries for /tomasz:', err);
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

// Colour tokens switched to the admin shell's own --admin-danger /
// --admin-text-secondary here, rather than the public site's
// --verdict-red / --ink-soft this component used before the redesign -
// keeps this tab's palette fully self-contained instead of quietly
// pulling in a colour from the public site's own design system.
function Sparkline({ values, danger }: { values: number[]; danger?: boolean }) {
  if (values.every((v) => v === 0)) return null;
  return (
    <svg viewBox="0 0 120 32" className={styles.sparkline} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={sparklinePoints(values)}
        fill="none"
        style={{ stroke: danger ? 'var(--admin-danger)' : 'var(--admin-text-secondary)', strokeWidth: 1.5 }}
      />
    </svg>
  );
}

export default async function AdminDashboardPage(
  props: {
    searchParams: Promise<{ hours?: string }>;
  }
) {
  const searchParams = await props.searchParams;
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
    userBackfillStatus,
    seedAssistantConfigStatus,
    browserBreakdown,
    siteStats,
    assistantQuestions,
    allUserEmails,
    assistantConfig,
    allUserAccounts,
    geminiUsageByTask,
    broadcastSummaries,
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
    getUserBackfillStatus(),
    getSeedAssistantConfigStatus(),
    getBrowserBreakdown(),
    getSiteStatsSafe(windowHours),
    getAssistantQuestionsSafe(),
    getAllUserEmailsSafe(),
    getAssistantConfig(),
    getAllUserAccountsSafe(),
    getGeminiUsageByTaskSafe(),
    getBroadcastSummariesSafe(),
  ]);
  const health = getServerHealth();
  const commonQuestions = groupSimilarQuestions(assistantQuestions);

  const trendRequests = siteStats?.trend.map((t) => t.requests) ?? [];
  const trendFailures = siteStats?.trend.map((t) => t.failures) ?? [];
  const trendFailureRate = siteStats?.trend.map((t) => (t.requests > 0 ? (t.failures / t.requests) * 100 : 0)) ?? [];
  const trendAvgMs = siteStats?.trend.map((t) => t.avgMs) ?? [];

  const overviewContent = (
    <>
      <p style={{ marginBottom: '1.2rem' }}>
        <a href="/privacy-draft" style={{ color: 'var(--admin-accent)' }}>Privacy policy draft &rarr;</a>
      </p>
      <h2 className={styles.sectionHeading}>Server &amp; hosting</h2>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>This instance</div>
          <p className={styles.note}>Site: {health.siteName}</p>
          <p className={styles.note}>Host: {health.hostname}</p>
          <p className={styles.note}>Region: {health.region}</p>
          <p className={styles.note}>Resource group: {health.resourceGroup}</p>
          <p className={styles.note}>Instance ID: {health.instanceId}</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Runtime health</div>
          <p className={styles.note}>Uptime: {fmtUptime(health.uptimeSeconds)}</p>
          <p className={styles.note}>Node version: {health.nodeVersion}</p>
          <p className={styles.note}>Environment: {health.nodeEnv}</p>
          <p className={styles.note}>Memory: {health.memoryUsedMB}MB / {health.memoryTotalMB}MB</p>
        </div>
      </div>
    </>
  );

  const trafficContent = (
    <>
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
        <p className={styles.warnNote}>Couldn&apos;t load traffic stats right now - Application Insights may be unreachable. Rest of this page is unaffected.</p>
      ) : (
        <>
          <div className={styles.grid} style={{ marginBottom: '1.2rem' }}>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Total requests</div>
              <Sparkline values={trendRequests} />
              <div className={styles.metricValue}>{siteStats.totalRequests}</div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Failed requests</div>
              <Sparkline values={trendFailures} danger={siteStats.failedRequests > 0} />
              <div className={`${styles.metricValue} ${siteStats.failedRequests > 0 ? styles.metricValueDanger : ''}`}>
                {siteStats.failedRequests}
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Failure rate</div>
              <Sparkline values={trendFailureRate} danger={siteStats.failureRatePct > 0} />
              <div className={`${styles.metricValue} ${siteStats.failureRatePct > 0 ? styles.metricValueDanger : ''}`}>
                {siteStats.failureRatePct}%
              </div>
            </div>
            <div className={styles.card}>
              <div className={styles.cardTitle}>Avg response time</div>
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
                    <td>
                      <span
                        className={styles.mono}
                        title={r.route}
                        style={{ display: 'inline-block', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}
                      >
                        {r.route}
                      </span>
                    </td>
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
              <div className={styles.cardTitle} style={{ marginTop: '1.2rem', marginBottom: '0.5rem' }}>Top exceptions</div>
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
    </>
  );

  const jobsContent = (
    <>
      <h2 className={styles.sectionHeading}>Scheduled jobs</h2>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Fuel price (weekly)</div>
          {fuelStatus ? (
            <p className={styles.note}>Week commencing {fuelStatus.weekCommencing} &middot; {fuelStatus.pricePenceLitre}p/litre</p>
          ) : (
            <p className={styles.warnNote}>No record found - has this ever run successfully?</p>
          )}
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="update-fuel-price" label="Run now" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Reminder check (daily)</div>
          {reminderStatus ? (
            <p className={styles.note}>
              Last run {fmtDate(reminderStatus.lastRunAt)} &middot; checked {reminderStatus.checked}, sent{' '}
              {reminderStatus.sent}
            </p>
          ) : (
            <p className={styles.warnNote}>No record found - has this ever run successfully?</p>
          )}
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="check-reminders" label="Run now" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Delete expired share links (daily)</div>
          <p className={styles.note}>Permanently removes any shareable report link past its expiry date.</p>
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="delete-expired-share-links" label="Run now" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Purge stale data</div>
          <p className={styles.note}>
            Notifications (read &amp; 90+ days old, or any age past a year), abandoned receipt-scan batches (48h+),
            knowledge base/personality version history beyond the most recent 50, and impersonation log entries
            over a year old.
          </p>
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="purge-stale-data" label="Run now" />
          </div>
        </div>
      </div>

      <h2 className={styles.sectionHeading}>Migrations (one-time, safe to re-run)</h2>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Assistant config seed</div>
          <p className={styles.warnNote} style={{ marginBottom: '0.5rem' }}>
            Creates the assistant&apos;s live knowledge base and personality document in the database, seeded from
            the current hardcoded content, ahead of the admin-editable knowledge base and personality panel. Does
            nothing if the document already exists - safe to click more than once, and will never overwrite
            live-edited content once it has been run.
          </p>
          {seedAssistantConfigStatus ? (
            <p className={styles.note}>Seeded {fmtDate(seedAssistantConfigStatus.lastRunAt)}</p>
          ) : (
            <p className={styles.warnNote}>Not run yet - the assistant will not respond until this has been run once.</p>
          )}
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="seed-assistant-config" label="Run seed" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Bike-ID backfill</div>
          <p className={styles.warnNote} style={{ marginBottom: '0.5rem' }}>
            Tags every existing service/fuel/mods/bills/reminder record with its bike&apos;s ID, ahead of multi-bike
            support. Does nothing to records already tagged - safe to click more than once.
          </p>
          {bikeIdBackfillStatus ? (
            <p className={styles.note}>
              Last run {fmtDate(bikeIdBackfillStatus.lastRunAt)} &middot; {bikeIdBackfillStatus.bikesProcessed} bike(s) &middot;{' '}
              {bikeIdBackfillStatus.docsPatched} record(s) patched
              {bikeIdBackfillStatus.shareLinksPatched != null && ` \u00b7 ${bikeIdBackfillStatus.shareLinksPatched} share link(s) patched`}
            </p>
          ) : (
            <p className={styles.warnNote}>Not run yet.</p>
          )}
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="backfill-bike-id" label="Run backfill" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>User document backfill</div>
          <p className={styles.warnNote} style={{ marginBottom: '0.5rem' }}>
            Creates a missing user document for every email that has ever had a session - a bug in
            createSessionForEmail() meant this never actually happened for anyone, live or historical. Skips any
            email that already has one, so safe to click more than once.
          </p>
          {userBackfillStatus ? (
            <p className={styles.note}>
              Last run {fmtDate(userBackfillStatus.lastRunAt)} &middot; {userBackfillStatus.usersCreated} user(s) created &middot;{' '}
              {userBackfillStatus.alreadyExisted} already existed
            </p>
          ) : (
            <p className={styles.warnNote}>Not run yet.</p>
          )}
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="backfill-users" label="Run backfill" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Mileage audit</div>
          <p className={styles.warnNote} style={{ marginBottom: '0.5rem' }}>
            Re-flags any AI-derived mileage that breaks chronological ordering against its own neighbouring records
            (mileage can only go up over time), or where a full-tank fill-up&apos;s litres imply an impossible mpg
            against the fill before it - catches records damaged by earlier estimator bugs, including ones
            already marked &quot;confirmed&quot;. Never changes the mileage value itself, only re-flags it for review.
            Safe to click more than once.
          </p>
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="audit-mileage" label="Run audit" />
          </div>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Purge orphaned receipt requests</div>
          <p className={styles.warnNote} style={{ marginBottom: '0.5rem' }}>
            Deletes any receipt request left behind by a shareable link that no longer exists - this backlog only
            exists because deleting or expiring a link didn&apos;t used to take its requests with it. New deletes
            and expiries now cascade automatically, so this is a one-off catch-up, not something to schedule.
            Safe to click more than once - finds nothing once the backlog is clear.
          </p>
          <div style={{ marginTop: '0.6rem' }}>
            <RunCronButton name="purge-orphaned-receipt-requests" label="Run purge" />
          </div>
        </div>
      </div>
    </>
  );

  const accountsContent = (
    <>
      <h2 className={styles.sectionHeading}>Accounts</h2>
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Total registered users</div>
          <p className={styles.metricValue}>{totalUsers}</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Active sessions right now</div>
          <p className={styles.metricValue}>{activeSessions}</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Magic links</div>
          <p className={styles.note}>Used: {detailedCounts.usedMagicLinks}</p>
          <p className={styles.note}>Requested but never clicked: {detailedCounts.unusedMagicLinks}</p>
        </div>
        <div className={styles.card}>
          <div className={styles.cardTitle}>Sessions</div>
          <p className={styles.note}>Active: {activeSessions}</p>
          <p className={styles.note}>Expired (still stored): {detailedCounts.expiredSessions}</p>
        </div>
      </div>

      <h2 className={styles.sectionHeading}>All accounts</h2>
      <p className={styles.warnNote} style={{ marginBottom: '0.6rem' }}>
        Premium is granted manually here, not via real payment yet - see subscriptions.ts. Grants are capped at 3
        years; blocking signs the account out immediately, not just on their next login attempt. Sessions forces
        a re-authentication without blocking - every device signed out now, but they can sign straight back in.
        Delete is permanent - every bike, record, and share link tied to that email is gone, with no undo.
      </p>
      {allUserAccounts.length === 0 ? (
        <p className={styles.warnNote}>No accounts found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Created</th>
              <th>Status</th>
              <th>Premium</th>
              <th>Story cooldown</th>
              <th>Sessions</th>
              <th>Delete</th>
            </tr>
          </thead>
          <tbody>
            {allUserAccounts.map((u) => (
              <tr key={u.email}>
                <td>{u.email}</td>
                <td>{fmtDate(u.createdAt)}</td>
                <td>
                  {u.blocked ? <span style={{ color: 'var(--admin-danger)' }}>Blocked</span> : 'Active'}{' '}
                  <BlockAccountButton email={u.email} blocked={!!u.blocked} />
                </td>
                <td><GrantPremiumForm email={u.email} plan={u.plan ?? null} /></td>
                <td><ResetStoryCooldownButton email={u.email} /></td>
                <td><RevokeSessionsButton email={u.email} /></td>
                <td><DeleteAccountButton email={u.email} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>Magic link requests (every email, ever - including ones that never completed sign-in)</h2>
      {magicLinkRequests.length === 0 ? (
        <p className={styles.warnNote}>No magic link requests recorded.</p>
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
        <p className={styles.warnNote}>No sessions recorded.</p>
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
      <p className={styles.warnNote} style={{ marginBottom: '0.6rem' }}>
        IP and browser capture were only added partway through development - both will show as &quot;-&quot; for
        any login before that point, genuinely absent, not a display bug.
      </p>
      {recentSessions.length === 0 ? (
        <p className={styles.warnNote}>No sessions recorded.</p>
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
    </>
  );

  const notificationsContent = (
    <>
      <SendNotificationForm allEmails={allUserEmails} />
      <div style={{ marginTop: '1.2rem' }}>
        <ClearNotificationsForm broadcasts={broadcastSummaries} allEmails={allUserEmails} />
      </div>
    </>
  );

  const assistantContent = (
    <>
      <h2 className={styles.sectionHeading}>Gemini API usage</h2>
      <p className={styles.note} style={{ marginBottom: '0.6rem' }}>
        Real Gemini API calls, by task, over the last 90 days (older entries expire automatically).
      </p>
      {geminiUsageByTask.length === 0 ? (
        <p className={styles.warnNote}>No Gemini calls logged yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Task</th>
              <th>Calls</th>
            </tr>
          </thead>
          <tbody>
            {geminiUsageByTask.map((u) => (
              <tr key={u.task}>
                <td>{u.task}</td>
                <td>{u.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 className={styles.sectionHeading}>Assistant configuration</h2>
      {assistantConfig ? (
        <KnowledgeBaseEditor
          initialContent={assistantConfig.knowledgeBase}
          initialUpdatedAt={assistantConfig.knowledgeBaseUpdatedAt}
        />
      ) : (
        <p className={styles.warnNote} style={{ marginBottom: '1.5rem' }}>
          Couldn&apos;t load the assistant config - has the seed migration in Jobs &amp; migrations been run yet?
        </p>
      )}

      <h2 className={styles.sectionHeading}>Question log</h2>
      <p className={styles.note} style={{ marginBottom: '0.6rem' }}>
        {assistantQuestions.length} question{assistantQuestions.length === 1 ? '' : 's'} logged in total.
      </p>
      <p className={styles.warnNote} style={{ marginBottom: '0.6rem' }}>
        Signed-in questions are linked to the account that asked them - this isn&apos;t covered
        in the privacy policy yet, see the note in assistantQuestionLog.ts.
      </p>
      <p className={styles.warnNote} style={{ marginBottom: '0.6rem' }}>
        &quot;Most common&quot; below is an exact-match count on normalized text, not real theme
        clustering - &quot;when&apos;s my MOT due&quot; and &quot;MOT due date&quot; count as two
        different questions despite meaning the same thing. Treat this as a signal to skim the
        raw list below for real patterns, not as a definitive ranking.
      </p>
      {commonQuestions.length === 0 ? (
        <p className={styles.warnNote}>No questions logged yet.</p>
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

      <h3 className={styles.cardTitle} style={{ marginTop: '1.2rem', marginBottom: '0.6rem' }}>Most recent</h3>
      <AssistantQuestionsTable questions={assistantQuestions.slice(0, 100)} />
    </>
  );

  const databaseContent = (
    <>
      {cosmosInfo && (
        <p className={styles.note} style={{ marginBottom: '0.8rem' }}>
          Partition key: <code className={styles.mono}>{cosmosInfo.partitionKeyPath}</code> &middot; Indexing: {cosmosInfo.indexingMode}
          {cosmosInfo.defaultTtl != null && ` \u00b7 Default TTL: ${cosmosInfo.defaultTtl}s`}
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
    </>
  );

  return (
    <AdminShell
      overviewContent={overviewContent}
      trafficContent={trafficContent}
      jobsContent={jobsContent}
      accountsContent={accountsContent}
      notificationsContent={notificationsContent}
      assistantContent={assistantContent}
      databaseContent={databaseContent}
      logoutButton={<AdminLogoutButton />}
    />
  );
}
