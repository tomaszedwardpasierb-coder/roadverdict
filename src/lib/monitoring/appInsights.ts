import { ClientSecretCredential } from "@azure/identity";

const APP_INSIGHTS_RESOURCE_ID =
  "/subscriptions/bb9e306b-3a3f-485e-9c3e-a952ce5aaecf/resourceGroups/roadverdict-rg/providers/microsoft.insights/components/roadverdict-insights";

let credential: ClientSecretCredential | null = null;
function getCredential() {
  if (!credential) {
    credential = new ClientSecretCredential(
      process.env.AZURE_TENANT_ID!,
      process.env.AZURE_CLIENT_ID!,
      process.env.AZURE_CLIENT_SECRET!
    );
  }
  return credential;
}

interface LogsTable {
  name: string;
  columns: { name: string; type: string }[];
  rows: any[][];
}

async function runQuery(kql: string, timespanIso: string): Promise<LogsTable[]> {
  const token = await getCredential().getToken("https://api.loganalytics.io/.default");
  if (!token) {
    throw new Error("Failed to acquire Log Analytics access token.");
  }

  const res = await fetch(`https://api.loganalytics.io/v1${APP_INSIGHTS_RESOURCE_ID}/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: kql, timespan: timespanIso }),
  });

  const body = await res.json();

  if (!res.ok) {
    const message = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Log Analytics query failed: ${message}`);
  }

  return body.tables as LogsTable[];
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
  const timespan = `PT${windowHours}H`;

  // NOTE: failure detection uses resultCode (actual HTTP status), not the
  // requests table's own `success` column - App Insights' auto-instrumentation
  // marks a request as "success" whenever the handler completes without
  // throwing, even if it deliberately returns a 4xx/5xx response (as our own
  // catch blocks do). Confirmed via real data: a 502 from this very endpoint
  // during debugging showed success == true.
  const [overallTables, byRouteTables, exceptionTables] = await Promise.all([
    runQuery(
      `requests
       | extend StatusCode = toint(resultCode)
       | summarize Total=count(), Failed=countif(StatusCode >= 400), AvgMs=avg(duration)`,
      timespan
    ),
    runQuery(
      `requests
       | extend StatusCode = toint(resultCode)
       | summarize Requests=count(), Failures=countif(StatusCode >= 400), AvgMs=avg(duration) by Route=name
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
