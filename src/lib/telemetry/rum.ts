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
//
// Uses trackEvent, not trackMetric - confirmed by reading this package's
// own source (v3 is OpenTelemetry-based internally, per instrumentation.ts's
// comment), not assumed: TelemetryClient.trackMetric() creates an
// OpenTelemetry Histogram and records into the METRICS pipeline
// (meter.createHistogram(...).record(...)), which does not produce
// queryable rows in this Log Analytics workspace at all. trackEvent()
// instead goes through the same OpenTelemetry LOGS pipeline
// (_logApi.trackEvent -> this._logger.emit(logRecord)) that already
// populates the `requests` table - it lands in `customEvents`, with
// `properties`/`measurements` both queryable per-event. Verified this the
// hard way this session: requests to /api/rum/tab-switch were confirmed
// live in the `requests` table (200s, real durations) while trackMetric's
// output was nowhere to be found in `customMetrics` after switching tabs
// on the deployed site - not a hypothetical, an actual empty-query result
// that sent this investigation into the SDK source to find out why.
type ApplicationInsightsModule = any;

function getClient(): any {
  if (!process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) return null; // no App Insights configured (e.g. local dev) - silent no-op, matching every other optional integration in this app
  try {
    // eslint-disable-next-line no-eval
    const appInsights: ApplicationInsightsModule = eval("require")("applicationinsights");
    // instrumentation.ts's register() already called .setup(...).start()
    // once for this process - this is that same client, not a second one.
    // Deliberately not cached across calls: defaultClient is only assigned
    // once register()'s own setup() call runs, and re-reading this plain
    // property on every call (instead of caching a possibly-still-null
    // result from a call that raced register() at process startup) costs
    // nothing but avoids permanently caching a false "not configured".
    return appInsights.defaultClient ?? null;
  } catch {
    return null;
  }
}

export function trackTabSwitchTiming(input: { tab: string; durationMs: number; firstVisit: boolean }): void {
  const client = getClient();
  if (!client) return;
  client.trackEvent({
    name: "DashboardTabSwitch",
    properties: { tab: input.tab, firstVisit: String(input.firstVisit) },
    measurements: { durationMs: input.durationMs },
  });
}
