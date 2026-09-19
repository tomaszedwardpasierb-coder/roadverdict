# Dashboard tab-switch latency — handover

**Context for whoever picks this up:** the user reported a ~1 second visible delay when clicking sidebar menu items on the RoadVerdict dashboard (roadverdict.co.uk). This document covers what's been tested, what's already shipped, and what's still open. Written from a live investigation session — treat the numbers as real measurements taken on 2026-09-19, not estimates.

## App/route in question

- Next.js 15 App Router, deployed to Azure App Service (`roadverdict`), Cosmos DB backend (`roadverdict-db`), Azure UK South.
- The dashboard (`src/app/dashboard/page.tsx` + `src/app/dashboard/DashboardShell.tsx`) has ~19 tabs (Dashboard, Service, Fuel, Mods, Bills, Fines, Tolls, Labour, Reminders, Reports, Story, Vault, ShareLinks, QuoteChecker, CostCalculator, BuyingGuide, Privacy, TransferOwnership, Security).
- Each tab switch is a **real navigation** to `/dashboard?tab=<key>` (not client-only state) — `page.tsx` is `export const dynamic = "force-dynamic"` and re-runs server-side on every switch, building only the requested tab's JSX (an existing, pre-session optimization).
- Demo account for testing: `demo@roadverdict.co.uk` — logging in with this exact email on `/login` bypasses real magic-link email entirely (see `src/app/api/auth/request-link/route.ts`) and grants an immediate session against a shared, deliberately-public sandbox account. Safe to use freely, including against production.

## What was tested and found

### 1. Original HAR analysis (browser DevTools export from the user)
- Ruled out network/DNS/TLS as the cause — `dns`/`connect`/`ssl` were all cached/reused (`-1`), `receive` was ~1ms.
- `icon-192.png` (PWA manifest icon) showed 1360ms of pure server wait (TTFB) on first hit, then dropped to 111ms/54ms on identical subsequent requests — a cold-path artifact for that one file, not indicative of general request latency.
- `favicon.ico` returned via `x-nextjs-cache: HIT` (edge cache); `icon-192.png` did not, because `middleware.ts`'s matcher only excludes `_next/static`, `_next/image`, and `favicon.ico` — confirmed in code, not guessed.

### 2. Local instrumentation (Playwright against `next dev`, pointed at the **real production Cosmos DB** via a local `.env.local`)
- The actual `/dashboard?tab=X` RSC fetch (the real navigation request) consistently returned in **70–110ms**. This ruled out the `page.tsx` serial Cosmos DB fetch chain as the bottleneck — a hypothesis that looked plausible from reading the code (page.tsx does ~6 sequential await stages, several Cosmos round trips each) but was directly refuted by measurement. **Do not rebuild that hypothesis without re-measuring first.**
- Cold click (no hover) between Dashboard↔Service: median 848ms (788–976ms), 4 trials.
- Hover-then-click (prefetched): median 795ms (764–803ms), 4 trials — **prefetch barely helped**, ~50ms difference, because the bottleneck wasn't the fetch, it was client-side remount cost (see below).
- Root cause identified: `DashboardShell.tsx` rendered `{contentMap[active]}` — a single DOM slot whose child component tree got swapped every tab switch, meaning React fully unmounted the outgoing tab and mounted the incoming one from scratch every single time (Chart.js canvases rebuilt, forms reset, lists re-rendered), even when revisiting an already-seen tab.

### 3. What was shipped (commit `df3f542`, pushed to `main`, deployed via `.github/workflows/main_roadverdict.yml`)
- `startTransition` around `router.push` in `DashboardShell.tsx`'s `goToTab` — nav click feedback stays responsive during the round trip.
- Chart.js `animation: false` on every chart's mount (`NO_MOUNT_ANIMATION` in `chartStyle.ts`, applied across `MpgChart`, `MileageChart`, `FuelCostChart`, `CategorySpendChart`, `SpendDonutChart`) — was replaying its ~1s default animation on every remount.
- `icon-192.png`/`icon-512.png` now cache `public, max-age=31536000, immutable` (`next.config.mjs`) instead of the framework default `max-age=0` — confirmed live via `curl -I` post-deploy.
- **The main fix**: `DashboardShell.tsx` now caches each visited tab's rendered content in a `useRef` (`mountedContentRef`), keyed by section, mutated synchronously during render (not in a `useEffect`, to avoid an extra blank frame). Every visited tab renders as its own stable `<div style={{ display: key === active ? 'block' : 'none' }}>` instead of sharing one slot — switching tabs now only ever toggles a style property for previously-visited tabs, never remounts them. **Trade-off accepted deliberately**: an unsaved form on one tab now persists when you switch away and back, instead of resetting; every tab visited in a session stays mounted (and its data goes stale) until revisited.
- Test coverage: updated `tests/components/DashboardShell.test.tsx` (one existing test's assertion was for the *old* teardown behavior and had to be corrected; one new test explicitly covers "keeps a previously-shown tab mounted, present but hidden, after switching away"). All 1486 component tests pass, typecheck/lint clean.
- CI (`test` → `authenticated-e2e` → `deploy` incl. post-deploy smoke test) ran green end to end on this push.

### 4. Production verification (Playwright + curl against the live site, post-deploy)
- **Revisit to an already-shown tab: 84–210ms across multiple clean runs.** The fix works exactly as designed.
- **First visit to a tab within a session: 800ms–2.3s, even under calm conditions**, on tabs with *no charts at all* (Bills, Fines, Labour) — ruling out the Chart.js angle as the explanation for this remaining cost. This is real and unaddressed by the shipped fix, which only ever targeted revisits.
- **A red herring that cost real investigation time**: during one round of testing, individual tab first-visits spiked to 2.5–6 seconds, including one `net::ERR_ABORTED`. Checking Azure Application Insights (`roadverdict-insights` resource) during that exact window showed **completely unrelated routes also multi-second slow at the same timestamps** — `GET /_not-found` (a 404): 26.8s, `GET /cars` (static marketing page): 11.8s, `GET /buying-guide`: 9.0s. Since a 404 handler and a static marketing page do no Cosmos work and no React remounting, this was conclusively an **infrastructure-level event** (the deploy's own App Service restart, compounded by heavy concurrent Playwright/curl test traffic from this same investigation, hitting a cold instance) — not a code bug in any specific tab. This settled down within ~15–20 minutes; re-testing afterward gave the clean 800ms–2.3s numbers above. **Lesson for next session: don't run rapid-fire concurrent load tests against production immediately after a deploy; space out test requests, and cross-check any alarming number against Application Insights' Performance > Operations view (30 min window) before concluding it's code-related.**

## Current state, honestly

- The specific complaint pattern "click Fuel, then Service, then back to Fuel repeatedly" is fixed — revisits are fast.
- The pattern "log in, click a few tabs you haven't visited yet this session" is **not fixed** — each first visit still costs roughly 1–2 seconds, and the actual RSC fetch itself is fast (confirmed 70-270ms across environments), so this remaining cost is client-side render/mount work, not backend or network.
- No client-side RUM exists in this app today — `src/instrumentation.ts` wires up server-side Application Insights only (dependency/request timing on the server). There is currently no way to see real users' actual click-to-render duration; everything in this document came from synthetic Playwright/curl testing, not real user telemetry.

## Planned next steps (not yet started)

1. **Add lightweight client-side RUM** — even a `performance.now()` delta from click to paint, sent to the already-configured Application Insights, would replace repeated manual spot-checking with real signal from real sessions. Recommended as the next thing to build, since further guessing from outside risks repeating the deploy-storm confusion above.
2. **Reduce the first-visit render/mount cost directly**, candidates in priority order (none built yet):
   - `page.tsx`'s `buildBikeCostForecastAllWindows` computes forecasts for *all three* windows on every single navigation (not just the active one), because a Server Component can't read the client's currently-selected window. This inflates every request's computation and RSC payload size, not just chart-heavy tabs — worth checking whether it can be trimmed to the default window only, with the other two fetched on demand.
   - Defer chart mounting specifically (mount surrounding layout first, mount the actual `<Line>/<Bar>` a tick later via effect/idle callback) so the tab appears "done" before the chart itself finishes setting up its canvas.
   - Virtualize long history lists (`ServiceHistoryCard`, `FuelLogCard`, `ModCard`, `BillCard` maps in `page.tsx`) for accounts with a lot of logged history — untested whether this matters for typical data volumes, but it's a real cost that scales with data and wasn't present in the demo account's dataset.
3. **Check Azure App Service "Always On" setting** — if the instance scales to zero/idles between requests, any user (not just post-deploy) could hit a cold-start tax on their first request of a session, independent of any dashboard code.

## Files changed this session

`next.config.mjs`, `src/app/dashboard/DashboardShell.tsx`, `src/app/dashboard/chartStyle.ts`, `src/app/dashboard/{MpgChart,MileageChart,FuelCostChart,CategorySpendChart,SpendDonutChart}.tsx`, `tests/components/DashboardShell.test.tsx`. Commit `df3f542` on `main`, already deployed and confirmed live.

## Follow-up session (2026-09-19, later same day)

Picked up the two "Planned next steps" below and made progress on both, but with an important negative result on the first one - documented honestly rather than glossed over.

### 1. `buildBikeCostForecastAllWindows`/`buildCarCostForecastAllWindows` trim - done, but likely not the fix for the 800ms-2.3s number

Confirmed by reading the code (not guessed): `page.tsx` was computing the full 4-window cost forecast (`buildBikeCostForecastAllWindows`/`buildCarCostForecastAllWindows`, plus `buildStatCardForecasts`) **unconditionally on every single dashboard request**, regardless of which tab `?tab=` actually named - including Bills/Fines/Labour/etc., which never use the result at all. Fixed in `src/app/dashboard/page.tsx`: both are now only computed when `activeSection === 'dashboard'` (needed by `DashboardStatCards`/`BudgetWidget`/`SpendDonutChart`/`MileageChart`) or, for the raw per-window bundle only, `activeSection === 'reports'` too (needed there by `CategorySpendChart` via `pickCategoryForecast`). Verified the gating is correct by tracing every call site of `bikeForecastByWindow`/`carForecastByWindow`/`spendForecastByWindow`/`mileageForecastByWindow`/`donutForecastByWindow` in the file - the first pass at this fix was wrong (assumed the per-category forecast was dashboard-only; it's also used by Reports) and got corrected before shipping.

**Honest caveat, found via local measurement, not assumed:** re-ran this session's own local-Playwright-against-production-Cosmos-DB method (same as the original investigation) after warming every route once (to avoid Next dev's own first-request-per-route compile cost polluting the number). Click-to-DOM for a genuine first visit to Bills/Fines/Labour/Tolls/Mods came back at **196-271ms** even *before* this fix was applied clean, tracked in the same session - i.e. the unconditional forecast computation was already cheap enough that removing it doesn't reproduce anything close to the 800ms-2.3s production number from item #4 above. That number may be specific to the deployed App Service environment (cold paths, real network latency to Cosmos, etc.) in a way this local setup still can't reproduce, similar to how item #4's own deploy-storm confusion turned out to be infrastructure noise, not application code. **This fix is still worth keeping** - it removes genuine wasted server-side compute on every non-dashboard, non-reports tab visit - but don't report the 800ms-2.3s issue as resolved by it. All 1486 component tests + 4867 unit/API tests pass, typecheck/lint clean.

### 2. Lightweight client-side RUM - built, deployed, verified live, and one real bug found + fixed along the way

Built exactly what item #1 below recommended: `DashboardShell.tsx` times every tab switch from click to two-`requestAnimationFrame`s-after-the-DOM-commit (a proxy for "actually painted"), and reports `{ tab, durationMs, firstVisit }` via `navigator.sendBeacon('/api/rum/tab-switch', ...)` (falling back to a `keepalive` `fetch` where `sendBeacon` doesn't exist). The route (`src/app/api/rum/tab-switch/route.ts`) validates the payload (auth-gated, clamps to a plausible 0-60000ms range, silently drops anything outside it) and forwards it via `src/lib/telemetry/rum.ts`.

**Deployed in commit `609301f`, and verified via the Azure portal (not assumed):** the user checked `roadverdict-insights` directly after clicking tabs on the live site. The `requests` table confirmed `/api/rum/tab-switch` was being hit successfully (200s, ~37-41ms) - so the client-side `sendBeacon` path works end to end. But the first version of `lib/telemetry/rum.ts` used `trackMetric()`, and a `customMetrics` query for `dashboard.tabSwitch.durationMs` came back with **0 rows** despite the successful requests.

Root-caused by reading `node_modules/applicationinsights`'s own source, not guessed: this package's v3 shim is OpenTelemetry-based internally (matches `instrumentation.ts`'s own comment), and `TelemetryClient.trackMetric()` specifically creates an OpenTelemetry `Histogram` and calls `.record()` on it (`shim/telemetryClient.js`'s `trackMetric` method) - that's the **Metrics** pipeline, which never produces a queryable Log Analytics row the way the old v1/v2 SDK's `trackMetric` did. `trackEvent()`, by contrast, goes through `_logApi.trackEvent()` -> `this._logger.emit(logRecord)` - the same OpenTelemetry **Logs** pipeline that was already populating the `requests` table the user had just successfully queried. **Fixed**: `lib/telemetry/rum.ts` now calls `client.trackEvent({ name: "DashboardTabSwitch", properties: { tab, firstVisit }, measurements: { durationMs } })` instead - `measurements` is the classic-SDK-contract field for a numeric value attached to a custom event, still exposed by the v3 shim's `EventTelemetry` type. This should now land in the `customEvents` table, queryable as:

```kusto
customEvents
| where name == "DashboardTabSwitch"
| extend tab = tostring(customDimensions.tab), firstVisit = tostring(customDimensions.firstVisit), durationMs = todouble(customMeasurements.durationMs)
| order by timestamp desc
```

Also fixed in the same pass: `getClient()` in `rum.ts` originally cached a `null` result forever the first time it was called (a real latent risk if this API route's first invocation ever raced `instrumentation.ts`'s `register()` at process startup, before `defaultClient` existed) - now re-reads `appInsights.defaultClient` fresh on every call instead, since it's a cheap property read and Node's own `require` cache already avoids repeated module loading.

**CONFIRMED LIVE, deployed as `ef3ead1`**: re-ran the `customEvents` query above after redeploying and clicking a few tabs on the live site - real rows came back, e.g. (all `firstVisit: true`, UTC 2026-09-19 ~18:15): `security` 589ms, `fines` 550ms, `labour` 509ms. One of these sessions was a genuinely different visitor (Cardiff/Linux/browser "Other"), not just the person testing this from Windows/Chrome/London earlier the same day - real usage, not only synthetic clicks. `tests/api/rum-tab-switch-route.test.ts` (6 cases) and `DashboardShell.test.tsx` (46 cases) both still pass. **The RUM pipeline is done and working - this is no longer an open item.**

### What this means for the original complaint

The underlying "first visit to a tab costs ~1-2s" issue from the "Current state, honestly" section above is **still open, but now has real data to work from**. The first real `firstVisit: true` samples (509-589ms) sit meaningfully between this session's own two synthetic estimates: the flawed local-Playwright test (196-271ms - later found to have a measurement bug, see item #1's own caveat) and the original production Playwright/curl test from the very first session (800ms-2.3s). Three data points is nowhere near enough to conclude anything yet - the next session (or the same one, after letting traffic accumulate for a day or two) should:

1. Run `customEvents | where name == "DashboardTabSwitch" | extend firstVisit = tostring(customDimensions.firstVisit), durationMs = todouble(customMeasurements.durationMs) | summarize avg(durationMs), percentile(durationMs, 95), count() by firstVisit` to see the real first-visit-vs-revisit gap at a decent sample size, not three anecdotes.
2. Only then decide which candidate fix (defer chart mounting, virtualize long lists, check the App Service "Always On" setting) is actually worth building - each one should be justified by what the real distribution shows (e.g. is it worse on chart-heavy tabs specifically, or uniform across all tabs regardless of content, which would point at something more structural like cold-start/Always-On rather than any particular tab's own rendering cost).

This session ruled out one hypothesis (the forecast computation, item #1 above) via direct measurement rather than assuming it was the cause, and built the actual unblock (real production RUM data) rather than taking a fourth guess at the root cause - that's the meaningful progress here, even though the original complaint isn't resolved yet.
