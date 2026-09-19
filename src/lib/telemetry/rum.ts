// Place at: src/lib/telemetry/rum.ts
//
// Real-user timing for the dashboard's tab-switch latency, reported from
// DashboardShell.tsx's click-to-visible measurement (see its own
// `reportTabSwitchTiming` comment) via POST /api/rum/tab-switch. Before
// this existed, DASHBOARD_LATENCY_HANDOVER.md's investigation had no way
// to see real users' actual click-to-render duration - only synthetic
// Playwright/curl spot-checks, which is exactly what led that session
// into the deploy-storm false alarm documented there (item #4). This
// reuses the exact same Application Insights connection
// instrumentation.ts already sets up server-side, rather than adding a
// second telemetry pipeline - see that file's own comment on why
// applicationinsights is required with eval("require") rather than a
// normal import; the same reasoning applies here.
type ApplicationInsightsModule = any;

let cachedClient: unknown = undefined;

function getClient(): any {
  if (cachedClient !== undefined) return cachedClient;
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
    cachedClient = null;
    return cachedClient;
  }
  try {
    // eslint-disable-next-line no-eval
    const appInsights: ApplicationInsightsModule = eval("require")("applicationinsights");
    // instrumentation.ts's register() already called .setup(...).start()
    // once for this process - this is that same client, not a second one.
    cachedClient = appInsights.defaultClient ?? null;
  } catch {
    cachedClient = null;
  }
  return cachedClient;
}

export function trackTabSwitchTiming(input: { tab: string; durationMs: number; firstVisit: boolean }): void {
  const client = getClient();
  if (!client) return; // no App Insights configured (e.g. local dev) - silent no-op, matching every other optional integration in this app
  client.trackMetric({
    name: "dashboard.tabSwitch.durationMs",
    value: input.durationMs,
    properties: { tab: input.tab, firstVisit: String(input.firstVisit) },
  });
}
