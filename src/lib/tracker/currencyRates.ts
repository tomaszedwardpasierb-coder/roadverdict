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
export async function getExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item("exchangeRates", "system").read<ExchangeRates>();
    return resource ?? null;
  } catch {
    return null;
  }
}
