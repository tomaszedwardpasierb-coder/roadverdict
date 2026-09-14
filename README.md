# RoadVerdict

A UK vehicle-ownership platform for motorcycles and cars, live at
[roadverdict.co.uk](https://roadverdict.co.uk). Free quote-checking and
buying-guide tools sit alongside **the Tracker** — the core product — where
owners log service history, fuel, mods, bills, fines/tolls and MOT data
against their vehicle, then generate a shareable, buyer-facing report when
selling.

## What's in here

- **Free tools**: quote checker (job → fair/high/second-opinion verdict),
  cost calculator, buying guide — bike and car variants of each.
- **The Tracker**: full ownership history (service, fuel/mileage, mods,
  bills, reminders, fines & tolls, MOT import), ownership transfer, and
  shareable report links for buyers.
- **Pro tier**: vehicle history check (VDI) via Stripe, an AI assistant
  (Gemini-backed, can draft log entries from a chat description), and
  **the Vault** — 2FA-gated encrypted document storage for V5C/insurance/
  licences.
- **Admin** (`/tomasz`): account management, impersonation with an audit
  trail, cron triggers, site stats.
- **Auth**: magic-link sign-in, optional TOTP 2FA — no passwords for
  regular users.

## Stack

Next.js 15 (App Router) · Azure Cosmos DB (single container, partitioned
by `/pk`) · Azure Blob Storage · Stripe · Resend · Google Gemini · deployed
to Azure App Service.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in real values — see below
npm run dev
```

Open http://localhost:3000.

`.env.example` lists every environment variable the app actually reads
(Cosmos, Blob Storage, Stripe, Resend, Gemini, admin/2FA secrets, cron
auth, Application Insights). None of it is optional for a full local
run — some features fail soft without a given key, but most tracker/auth
flows need Cosmos and Resend at minimum.

## Testing

```bash
npm run typecheck
npm run lint
npm test                # unit
npm run test:components
npm run test:integration  # needs a real (or test-account) Cosmos connection
npm run test:e2e          # Playwright, see TESTING.md for local setup
```

CI (`.github/workflows/main_roadverdict.yml`) runs all of the above,
including authenticated Playwright E2E against a real dedicated test
Cosmos account, before every deploy. See [TESTING.md](TESTING.md) for
details on running the E2E suite locally.

## Where things live

- `src/lib/tracker/` — the Tracker's domain logic (one file per record
  type, plus shared concerns like `atomicUpdate.ts` for etag-conditioned
  writes).
- `src/lib/payments/` — Stripe checkout/pricing.
- `src/app/api/` — route handlers, mirroring the domain layer above.
- `src/app/tomasz/` — the admin panel.
- `CARS_PHASE_PLAN.md` — the bike → car expansion plan and its current
  status.
