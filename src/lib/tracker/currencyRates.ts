// Place at: src/lib/tracker/currencyRates.ts
// Split out from currency.ts specifically so client components never
// pull the Cosmos SDK into their bundle just by importing currency
// types or conversion math - only page.tsx and the cron route should
// ever import this file.
import { getContainer } from "@/lib/cosmos";
import type { ExchangeRates } from "@/lib/tracker/currency";

// Cached once a day by a cron job - never fetched live on a page
// request, both to keep pages fast and to respect Frankfurter's
// abuse-prevention rate limiting.
//
// This function itself still paid for a fresh Cosmos point-read on
// every single call regardless - cheap in RU terms, but it's read on
// hot paths (the dashboard, every seller report) that each call it
// several times over in one page load. A short in-process TTL cache
// removes that fixed per-call network round trip for data that, by the
// comment above, only actually changes once a day.
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
let cached: { data: ExchangeRates | null; fetchedAt: number } | null = null;

export async function getExchangeRates(): Promise<ExchangeRates | null> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }
  try {
    const container = getContainer();
    const { resource } = await container.item("exchangeRates", "system").read<ExchangeRates>();
    cached = { data: resource ?? null, fetchedAt: Date.now() };
    return cached.data;
  } catch {
    // Not cached - a transient Cosmos hiccup shouldn't lock in "no
    // rates" for the whole TTL window; the next call just retries.
    return null;
  }
}
