# Testing RoadVerdict

Tests live in this repository and are run locally and in GitHub Actions. They do not require a separate application.

## Commands

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

`npm test` runs the fast unit suite under `tests/unit`. `npm run test:e2e` starts a local Next.js development server unless `PLAYWRIGHT_BASE_URL` is set. Browser tests under `tests/e2e` should use seeded, non-production accounts.

## Test boundaries

- Unit tests cover pure calculations and decision rules. They must not call Cosmos, VDG, Gemini, Blob Storage, email, or production services.
- API tests should mock the session and repository boundaries while verifying authentication, authorization, validation, read-only transfer rules, and error responses.
- Integration tests should use a dedicated isolated Cosmos database or emulator. Never point them at production data.
- End-to-end tests cover a small number of user journeys. External services should be replaced by deterministic fixtures or test doubles.

## Required production gates

Before deployment, keep typecheck, lint, unit tests, and the production build green. Add API authorization tests and authenticated Playwright journeys before treating the tracker as production-ready. The current public smoke tests are only scaffolding; they do not prove authenticated tracker behavior.

## Fixtures

Keep sanitized external responses in `tests/fixtures`, grouped by provider (`vdg`, `mot`, and `gemini`). Do not commit registrations, access tokens, raw customer data, or production receipts.