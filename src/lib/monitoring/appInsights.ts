import { ClientSecretCredential } from "@azure/identity";
import { LogsQueryClient, LogsQueryResultStatus } from "@azure/monitor-query-logs";

const APP_INSIGHTS_RESOURCE_ID =
  "/subscriptions/bb9e306b-3a3f-485e-9c3e-a952ce5aaecf/resourceGroups/roadverdict-rg/providers/microsoft.insights/components/roadverdict-insights";

let client: LogsQueryClient | null = null;
function getClient() {
  if (!client) {
    const credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!
    );
    client = new LogsQueryClient(credential);
  }
  return client;
}

async function runQuery(kql: string, timespan: { duration: string }) {
  const result = await getClient().queryResource(APP_INSIGHTS_RESOURCE_ID, kql, timespan);
  if (result.status !== LogsQueryResultStatus.Success) {
    throw new Error(
      `Log Analytics query failed: ${result.partialError?.message ?? "unknown error"}`
    );
  }
  return result.tables;
}

export interface RouteStat {
  route: string;
  requests: number;
  failures: number;
  failureRatePct: number;
  avgDurationMs: number;
}

export interface SiteStats {
  windowHours: number;
  totalRequests: number;
  failedRequests: number;
  failureRatePct: number;
  avgResponseTimeMs: number;
  byRoute: RouteStat[];
  topExceptions: { type: string; message: string; count: number }[];
}

export async function getSiteStats(windowHours = 24): Promise<SiteStats> {
  const timespan = { duration: `PT${windowHours}H` };

  const [overallTables, byRouteTables, exceptionTables] = await Promise.all([
    runQuery(
      `requests | summarize Total=count(), Failed=countif(success == false), AvgMs=avg(duration)`,
      timespan
    ),
    runQuery(
      `requests
       | summarize Requests=count(), Failures=countif(success == false), AvgMs=avg(duration) by Route=name
       | order by Requests desc | take 50`,
      timespan
    ),
    runQuery(
      `exceptions
       | summarize Count=count() by Type=type, Message=tostring(outerMessage)
       | order by Count desc | take 20`,
      timespan
    ),
  ]);

  const overallRow = overallTables[0]?.rows[0] as any[] | undefined;
  const total = Number(overallRow?.[0] ?? 0);
  const failed = Number(overallRow?.[1] ?? 0);

  return {
    windowHours,
    totalRequests: total,
    failedRequests: failed,
    failureRatePct: total ? Math.round((failed / total) * 1000) / 10 : 0,
    avgResponseTimeMs: Math.round(Number(overallRow?.[2] ?? 0)),
    byRoute: (byRouteTables[0]?.rows ?? []).map((r: any[]) => ({
      route: String(r[0]),
      requests: Number(r[1]),
      failures: Number(r[2]),
      failureRatePct: r[1] ? Math.round((Number(r[2]) / Number(r[1])) * 1000) / 10 : 0,
      avgDurationMs: Math.round(Number(r[3]) ?? 0),
    })),
    topExceptions: (exceptionTables[0]?.rows ?? []).map((r: any[]) => ({
      type: String(r[0]),
      message: String(r[1] ?? ""),
      count: Number(r[2]),
    })),
  };
}
