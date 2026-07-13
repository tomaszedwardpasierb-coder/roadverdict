# RoadVerdict — prototype

The quote-checker flow: bike → job → quoted price → fair/high/second-opinion verdict,
benchmarked against price data, logged anonymously.

## Important: I haven't run this myself

My sandbox's network access is locked to Adobe domains only, so I can't reach the npm
registry to run `npm install` or `npm run build` here. Everything below is hand-written
and I'm confident in the patterns, but you're the first one actually running it — if
`npm install` or `npm run dev` throws something, paste me the error and I'll fix it.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000 — you should see the quote-checker form.

## What's real vs placeholder right now

- **Real**: the form, the API route, input validation, the verdict logic, the anonymised
  SQLite logging, the security headers, the CSP, the SEO metadata/schema.
- **Sourced, but thin — check `src/lib/priceData.ts` comments before trusting any number**:
  the base job × bike-size price ranges. Chain-and-sprockets and the service-cost bands are
  anchored to named UK specialists' published prices; brake pads and tyres are thinner —
  one real source each, extrapolated for the sizes that source didn't cover.
- **Still pure placeholder, not sourced at all**: the brand-tier and region multipliers.
  That research hasn't happened yet.

## What's deliberately not built yet

- No deployment pipeline to the Azure Web App yet (comes next)
- No real database beyond local SQLite (fine until there's real traffic)
- No analytics, no cookie banner (not needed until analytics/tracking is added)
- No accounts/API keys needed for any of this — told you I'd flag it when that changes

## Where the money-relevant logic lives, if you want to check my work

- `src/lib/priceData.ts` — the benchmark ranges (placeholder)
- `src/lib/verdict.ts` — fair/high/second-opinion thresholds
- `src/app/api/verdict/route.ts` — validation, rate limiting, the anonymised log write
- `src/lib/db.ts` — the SQLite table; check the columns yourself, there's genuinely
  nothing identifying in there
