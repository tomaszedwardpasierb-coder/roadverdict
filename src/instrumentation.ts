// Place at: src/instrumentation.ts
//
// Manual instrumentation, not the portal's one-click "Enable" - that
// autoinstrumentation feature has its own supported-runtimes list, and
// this app's specific combination (Linux App Service, Node 24-lts)
// isn't on it, which is exactly what the "Not supported" message meant.
// This is Microsoft's own documented alternative: the applicationinsights
// package, initialized once here, rather than Azure injecting an agent
// with no code changes. Requires experimental.instrumentationHook: true
// in next.config.mjs on Next.js 14 specifically - without that flag this
// file is never called at all, silently, not an error.
//
// Deliberately uses eval("require") rather than a normal require() or
// import() below. instrumentation.ts is compiled by webpack for multiple
// bundling targets (confirmed against Next.js's own team discussing this
// exact behavior), and Next.js's serverComponentsExternalPackages config
// option - the documented way to exclude a Node-only package from
// bundling - only covers Server Components and Route Handlers, not this
// file specifically, so it has no effect here even though it's still
// worth keeping for anything else in the app that might need it later.
// applicationinsights v2's optional dependency correlation feature (used
// automatically as soon as the package is required, regardless of
// whether that specific feature is later toggled on) pulls in legacy
// packages (cls-hooked, async-listener) that reference genuine Node-only
// built-ins - crypto, os, http, net, timers - none of which exist in the
// Edge runtime webpack also tries to bundle this file for. A plain
// require() or import() is visible to webpack's static analysis, which
// is exactly what triggers it trying and failing to resolve those
// built-ins for a target that will never actually run this code at all,
// thanks to the runtime guard below. eval("require") is not syntactically
// a require() call, so webpack's analyzer can't see through it and
// doesn't attempt to bundle anything based on this line - at real
// runtime, in the actual Node.js process, it evaluates to the genuine
// require function and works completely normally. This is a long-
// standing, widely-used pattern for exactly this situation, not a hack
// specific to this app.

type ApplicationInsightsModule = any;

export async function register() {
  // Guards against this running in the Edge runtime, where Node-specific
  // APIs this package depends on don't exist. Next.js can call register()
  // from either runtime; this file should only do anything in the real
  // Node.js one.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const connectionString = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;
  if (!connectionString) {
    // Deliberately silent, not an error - matches how every other
    // optional integration in this app behaves when its env var isn't
    // set (the LLM prose pass, the Azure Monitor metrics). The app runs
    // correctly either way; this is additive visibility, never a
    // dependency.
    return;
  }

  // eslint-disable-next-line no-eval
  const appInsights: ApplicationInsightsModule = eval("require")("applicationinsights");

  appInsights
    .setup(connectionString)
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true, true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true, true)
    .setUseDiskRetryCaching(true)
    .setSendLiveMetrics(true)
    .start();
}

