# Testing RoadVerdict

Tests live in this repository and are run locally and in GitHub Actions. They do not require a separate application.

## Commands

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:components
npm run test:coverage
npm run build
npm run test:e2e
```

`npm test` runs the fast unit + API-contract suite under `tests/unit` and `tests/api` (mocked Cosmos/session/SDK boundaries). `npm run test:components` runs the jsdom-based React component suite under `tests/components` (see `vitest.components.config.ts`). `npm run test:e2e` starts a local Next.js development server unless `PLAYWRIGHT_BASE_URL` is set. Browser tests under `tests/e2e` should use seeded, non-production accounts.

## Test boundaries

- Unit tests cover pure calculations and decision rules. They must not call Cosmos, VDG, Gemini, Blob Storage, email, or production services.
- API tests should mock the session and repository boundaries while verifying authentication, authorization, validation, read-only transfer rules, and error responses.
- Integration tests should use a dedicated isolated Cosmos database or emulator. Never point them at production data.
- End-to-end tests cover a small number of user journeys. External services should be replaced by deterministic fixtures or test doubles.

## Integration tests (Cosmos DB Emulator)

`tests/integration/**/*.test.ts` runs against a real (local, non-production) Cosmos container instead of a mock - proving actual query shape, partition-key scoping, and upsert/point-read behavior that a mocked `@/lib/cosmos` can't verify. Not part of `npm test` - its own command locally, and its own CI job step (backed by the `cosmosdb-emulator` service container defined in the workflow, gating the deploy before `npm run build`).

Setup (one-time):

```powershell
winget install --id Microsoft.Azure.CosmosEmulator -e
```

Before each session:

```powershell
Start-Process "C:\Program Files\Azure Cosmos DB Emulator\CosmosDB.Emulator.exe" -ArgumentList "/NoUI" -WindowStyle Hidden
```

First launch after install can take several minutes to finish provisioning - subsequent starts are fast. Then:

```bash
npm run test:integration
```

`vitest.integration.config.ts`'s `globalSetup` (`tests/integration/globalSetup.ts`) points `COSMOS_CONNECTION_STRING` at the emulator's well-known local key, disables TLS verification for that process only (the emulator's cert is self-signed and machine-local - never done for anything that talks to production), and creates the `roadverdict` database / `app` container if they don't already exist. Every test must clean up the partition(s) it created via `tests/integration/testCosmos.ts`'s `cleanupPartition` helper (see the `afterEach` pattern in `cosmosHelpers.integration.test.ts`), since the emulator's on-disk store persists across runs. `fileParallelism: false` is set deliberately - every test file shares this one emulator container, and running files in parallel was enough to saturate it and cause real request timeouts in CI.

## Authenticated E2E journeys

`tests/e2e/authenticated-demo-journey.spec.ts` drives the real app through a real browser as the real demo account (`demo@roadverdict.co.uk`) - see `tests/e2e/helpers/demoAuth.ts`. That account is a genuine, designed-for-this sandbox: signing in as it bypasses the real magic-link email entirely and auto-seeds a real dataset (`src/app/api/auth/request-link/route.ts`'s `DEMO_EMAIL` branch), and `/api/demo/reset` rebuilds it from scratch on demand. This is what makes real, authenticated E2E possible without a second mailbox to poll, and it's the only test layer that proves the UI and backend actually wire together end to end rather than at a mocked boundary.

Tests run serially (`test.describe.configure({ mode: "serial" })`) and share backend state across the file - the first test resets the demo account to establish a known baseline for the rest.

Locally, run this against `npm run dev`/`npm run start` pointed at the Cosmos Emulator (same one integration tests use) - never against production:

```bash
PORT=3000 APP_URL=http://localhost:3000 NODE_TLS_REJECT_UNAUTHORIZED=0 \
COSMOS_CONNECTION_STRING="AccountEndpoint=https://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==;" \
npm run start &

PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/authenticated-demo-journey.spec.ts
```

In CI, this runs as its own pre-deploy gate (after `npm run build`, before the Azure login step) against a locally-started server backed by the same `cosmosdb-emulator` service container the integration tests use - `public-smoke.spec.ts` remains the only spec run post-deploy, against the real live site, since that one is genuinely safe to run unauthenticated and repeatedly.

## Required production gates

Before deployment, typecheck, lint, unit tests, component tests, Cosmos integration tests, the production build, and the authenticated E2E journeys must all be green - see the CI workflow for the exact gate order. The post-deploy public smoke test is deliberately not a gate: a failure there means the deploy already happened, and it's reporting the live site looks broken, not blocking anything.

## Fixtures

Keep sanitized external responses in `tests/fixtures`, grouped by provider (`vdg`, `mot`, and `gemini`). Do not commit registrations, access tokens, raw customer data, or production receipts.