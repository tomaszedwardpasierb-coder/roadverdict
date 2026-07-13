/**
 * Ages the static benchmark table forward between manual research refreshes,
 * using UK inflation as a proxy — not a scraper, not a live API call.
 *
 * I checked: ONS (Office for National Statistics) does publish a free,
 * public, no-key API for CPI data (developer.ons.gov.uk). I'm deliberately
 * NOT wiring that up as a live per-request call, for two concrete reasons:
 *
 * 1. I can't verify the exact dataset ID and response shape from this
 *    sandbox — no network access to test it here. Shipping an unverified
 *    external API call into the one code path that can't silently fail
 *    (the verdict calculation) is a bad trade for an unconfirmed benefit.
 * 2. CPI is only published monthly. A live call on every request buys
 *    nothing over a cached number — it's a new failure mode (network call,
 *    rate limits, schema changes) for zero actual freshness gain.
 *
 * The honest, low-risk version: update ONE number here every few months by
 * checking the ONS CPI headline % figure — a 30-second check, not a
 * research project. https://www.ons.gov.uk/economy/inflationandpriceindices
 *
 * This does NOT fix a sudden motorcycle-specific price shift (a parts
 * tariff, a labour shortage) — only general cost-of-living drift. It buys
 * time between the real thing this needs: periodically re-checking the
 * actual sources in priceData.ts, maybe twice a year.
 */

export const BENCHMARK_RESEARCHED_PERIOD = '2026-07'; // when priceData.ts was last checked against real sources

// Update this quarterly: (current ONS CPI index / index at BENCHMARK_RESEARCHED_PERIOD).
// Starts at 1.0 because it's the same month the benchmarks were researched.
export const INFLATION_MULTIPLIER_SINCE_RESEARCH = 1.0;
