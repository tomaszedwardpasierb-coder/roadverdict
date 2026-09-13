// Place at: src/lib/admin/stats.ts
import { getContainer } from "@/lib/cosmos";

export interface DbTypeCount {
  type: string;
  count: number;
}

export async function getDbStats(): Promise<DbTypeCount[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<DbTypeCount>({ query: "SELECT c.type, COUNT(1) as count FROM c GROUP BY c.type" })
    .fetchAll();
  return resources.sort((a, b) => b.count - a.count);
}

export async function getActiveSessionCount(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<number>({
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'session' AND c.expiresAt > @now",
      parameters: [{ name: "@now", value: new Date().toISOString() }],
    })
    .fetchAll();
  return resources[0] ?? 0;
}

export async function getTotalUserCount(): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<number>({ query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'user'" })
    .fetchAll();
  return resources[0] ?? 0;
}

export interface FuelPriceStatus {
  pricePenceLitre: number;
  weekCommencing: string;
}

export async function getFuelPriceStatus(): Promise<FuelPriceStatus | null> {
  const container = getContainer();
  try {
    interface FuelPriceDoc { pricePenceLitre: number; weekCommencing: string }
    const { resource } = await container.item("fuelPrice", "system").read<FuelPriceDoc>();
    if (!resource) return null;
    return { pricePenceLitre: resource.pricePenceLitre, weekCommencing: resource.weekCommencing };
  } catch {
    return null;
  }
}

export interface ReminderCronStatus {
  lastRunAt: string;
  checked: number;
  sent: number;
}

export async function getReminderCronStatus(): Promise<ReminderCronStatus | null> {
  const container = getContainer();
  try {
    const { resource } = await container.item("cronStatus::reminders", "system").read<ReminderCronStatus>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export interface BikeIdBackfillStatus {
  lastRunAt: string;
  bikesProcessed: number;
  docsPatched: number;
  shareLinksPatched?: number;
}

export async function getBikeIdBackfillStatus(): Promise<BikeIdBackfillStatus | null> {
  const container = getContainer();
  try {
    const { resource } = await container.item("cronStatus::backfillBikeId", "system").read<BikeIdBackfillStatus>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export interface UserBackfillStatus {
  lastRunAt: string;
  usersCreated: number;
  alreadyExisted: number;
}

// Same reasoning and shape as getBikeIdBackfillStatus above - tracks
// the one-off migration that creates a missing user document for
// every email that's ever had a session, see backfill-users/route.ts.
export async function getUserBackfillStatus(): Promise<UserBackfillStatus | null> {
  const container = getContainer();
  try {
    const { resource } = await container.item("cronStatus::backfillUsers", "system").read<UserBackfillStatus>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export interface SeedAssistantConfigStatus {
  lastRunAt: string;
}

// Simpler shape than the backfills above - this migration either
// creates the assistantConfig document once or does nothing on every
// later run, so there's no per-record count to report, just whether
// and when it happened. See seed-assistant-config/route.ts - the
// status doc is only written on the actual creation, not on a later
// "already seeded" no-op run, since nothing changed on those.
export async function getSeedAssistantConfigStatus(): Promise<SeedAssistantConfigStatus | null> {
  const container = getContainer();
  try {
    const { resource } = await container.item("cronStatus::seedAssistantConfig", "system").read<SeedAssistantConfigStatus>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export interface MagicLinkRequestSummary {
  email: string;
  requestCount: number;
  lastRequestedAt: string;
}

// One row per email that has ever requested a magic link - not one row
// per request, which could be very repetitive for someone who's
// requested a dozen times. Includes emails that never actually
// completed sign-in, which is worth knowing on its own.
export async function getMagicLinkRequests(): Promise<MagicLinkRequestSummary[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<MagicLinkRequestSummary>({
      query:
        "SELECT c.pk as email, COUNT(1) as requestCount, MAX(c.createdAt) as lastRequestedAt FROM c WHERE c.type = 'magicLink' GROUP BY c.pk",
    })
    .fetchAll();
  return resources.sort((a, b) => new Date(b.lastRequestedAt).getTime() - new Date(a.lastRequestedAt).getTime());
}

export interface RecentSession {
  email: string;
  createdAt: string;
  ip?: string;
  userAgent?: string;
}

// Most recent logins, newest first. IP will show as missing for any
// session created before that capture was added; userAgent the same
// for sessions before this specific field existed - genuinely absent,
// not a display bug either way.
export async function getRecentSessions(limit = 50): Promise<RecentSession[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<RecentSession>({
      query: "SELECT TOP @limit c.pk as email, c.createdAt, c.ip, c.userAgent FROM c WHERE c.type = 'session' ORDER BY c.createdAt DESC",
      parameters: [{ name: "@limit", value: limit }],
    })
    .fetchAll();
  return resources;
}

// Deliberately simple, not a full parsing library - order matters here,
// since most browsers' user-agent strings contain other browsers'
// names too (Chrome's contains "Safari", Edge's contains both "Chrome"
// and "Safari") - checking the most specific, distinguishing token
// first is what makes this work without a dependency.
export function browserFamily(userAgent: string | undefined): string {
  if (!userAgent) return "Unknown";
  const ua = userAgent;
  if (/EdgA|EdgiOS|Edge|Edg\//.test(ua)) return "Edge";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/FxiOS|Firefox/.test(ua)) return "Firefox";
  if (/CriOS|Chrome/.test(ua)) return "Chrome";
  if (/Safari/.test(ua)) return "Safari";
  return "Other";
}

export interface BrowserBreakdownEntry {
  browser: string;
  count: number;
}

// Aggregate only - counts by browser family, never tied back to an
// individual session or email in this view. Built from the same
// session documents getRecentSessions reads, just summarised
// differently.
export async function getBrowserBreakdown(): Promise<BrowserBreakdownEntry[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ userAgent?: string }>({
      query: "SELECT c.userAgent FROM c WHERE c.type = 'session'",
    })
    .fetchAll();

  const counts = new Map<string, number>();
  for (const r of resources) {
    const family = browserFamily(r.userAgent);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([browser, count]) => ({ browser, count }))
    .sort((a, b) => b.count - a.count);
}

export interface ServerHealth {
  uptimeSeconds: number;
  nodeVersion: string;
  memoryUsedMB: number;
  memoryTotalMB: number;
  siteName: string;
  hostname: string;
  region: string;
  resourceGroup: string;
  instanceId: string;
  nodeEnv: string;
}

// Pulled from Node's own process APIs plus environment variables Azure
// App Service automatically injects into every instance - no new
// credentials or API calls needed for any of this.
export function getServerHealth(): ServerHealth {
  const mem = process.memoryUsage();
  return {
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    memoryUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
    memoryTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
    siteName: process.env.WEBSITE_SITE_NAME ?? "unknown",
    hostname: process.env.WEBSITE_HOSTNAME ?? "unknown",
    region: process.env.REGION_NAME ?? "unknown",
    resourceGroup: process.env.WEBSITE_RESOURCE_GROUP ?? "unknown",
    instanceId: (process.env.WEBSITE_INSTANCE_ID ?? "unknown").slice(0, 12),
    nodeEnv: process.env.NODE_ENV ?? "unknown",
  };
}

export interface CosmosContainerInfo {
  partitionKeyPath: string;
  defaultTtl: number | null;
  indexingMode: string;
}

// Container-level metadata the Cosmos SDK already has access to via the
// same connection every other query uses - not a new API surface.
export async function getCosmosContainerInfo(): Promise<CosmosContainerInfo | null> {
  try {
    const container = getContainer();
    const { resource } = await container.read();
    if (!resource) return null;
    return {
      partitionKeyPath: resource.partitionKey?.paths?.[0] ?? "unknown",
      defaultTtl: resource.defaultTtl ?? null,
      indexingMode: resource.indexingPolicy?.indexingMode ?? "unknown",
    };
  } catch {
    return null;
  }
}

export interface DetailedCounts {
  expiredSessions: number;
  usedMagicLinks: number;
  unusedMagicLinks: number;
}

// Every function above this line that scans the whole container (no
// partition key - GROUP BY or a bare COUNT/SELECT across every doc of a
// type) is cheap today, but its cost scales with total document count,
// not with how often an admin actually looks at this page. getAdminStatsBundle
// below is the one thing /tomasz should actually call for these seven -
// it wraps them in a short-lived Cosmos-backed cache (same pattern as
// buyingGuideLookupCache.ts) so a page reload, a tab switch, or two
// admins looking at once within the same minute triggers one real scan
// of each, not one per page view. The individual functions stay exported
// and untouched (including their own direct unit tests) - this only
// changes how often /tomasz's Promise.all actually calls them.
export interface AdminStatsBundle {
  dbStats: DbTypeCount[];
  activeSessionCount: number;
  totalUserCount: number;
  magicLinkRequests: MagicLinkRequestSummary[];
  recentSessions: RecentSession[];
  browserBreakdown: BrowserBreakdownEntry[];
  detailedCounts: DetailedCounts;
}

interface AdminStatsCacheDoc {
  id: string;
  pk: "system";
  type: "adminStatsCache";
  cachedAt: string;
  data: AdminStatsBundle;
}

const ADMIN_STATS_CACHE_ID = "adminStatsCache";
const ADMIN_STATS_CACHE_PK = "system";
// An internal dashboard, not a customer-facing number - a bit of
// staleness costs nothing here, and the actions that DO need to feel
// instant on this page (blocking an account, granting Pro, etc.) all
// come from separate, uncached reads elsewhere in tomasz/page.tsx, not
// from anything in this bundle.
const ADMIN_STATS_CACHE_TTL_MS = 60 * 1000;

export async function getAdminStatsBundle(): Promise<AdminStatsBundle> {
  const container = getContainer();

  try {
    const { resource } = await container.item(ADMIN_STATS_CACHE_ID, ADMIN_STATS_CACHE_PK).read<AdminStatsCacheDoc>();
    if (resource && Date.now() - new Date(resource.cachedAt).getTime() < ADMIN_STATS_CACHE_TTL_MS) {
      return resource.data;
    }
  } catch {
    // No cache doc yet, or a transient read failure - fall through to a
    // real (if slower) read below rather than failing the whole page.
  }

  const [dbStats, activeSessionCount, totalUserCount, magicLinkRequests, recentSessions, browserBreakdown, detailedCounts] = await Promise.all([
    getDbStats(),
    getActiveSessionCount(),
    getTotalUserCount(),
    getMagicLinkRequests(),
    getRecentSessions(50),
    getBrowserBreakdown(),
    getDetailedCounts(),
  ]);
  const data: AdminStatsBundle = { dbStats, activeSessionCount, totalUserCount, magicLinkRequests, recentSessions, browserBreakdown, detailedCounts };

  try {
    const doc: AdminStatsCacheDoc = { id: ADMIN_STATS_CACHE_ID, pk: ADMIN_STATS_CACHE_PK, type: "adminStatsCache", cachedAt: new Date().toISOString(), data };
    await container.items.upsert(doc);
  } catch (err) {
    // The fresh data is still good - a failure to cache it just means
    // the next request within the window does a real scan again too,
    // not that this request should fail.
    console.error("getAdminStatsBundle: failed to write the cache doc (serving the fresh read anyway):", err);
  }

  return data;
}

export async function getDetailedCounts(): Promise<DetailedCounts> {
  const container = getContainer();
  const now = new Date().toISOString();
  const [expiredSessions, usedMagicLinks, unusedMagicLinks] = await Promise.all([
    container.items
      .query<number>({
        query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'session' AND c.expiresAt <= @now",
        parameters: [{ name: "@now", value: now }],
      })
      .fetchAll()
      .then((r) => r.resources[0] ?? 0),
    container.items
      .query<number>({ query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'magicLink' AND c.used = true" })
      .fetchAll()
      .then((r) => r.resources[0] ?? 0),
    container.items
      .query<number>({ query: "SELECT VALUE COUNT(1) FROM c WHERE c.type = 'magicLink' AND c.used = false" })
      .fetchAll()
      .then((r) => r.resources[0] ?? 0),
  ]);
  return { expiredSessions, usedMagicLinks, unusedMagicLinks };
}
