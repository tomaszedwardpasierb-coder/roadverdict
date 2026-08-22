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
