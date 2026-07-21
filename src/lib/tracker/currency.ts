// Place at: src/lib/tracker/currency.ts

export type Currency = "GBP" | "EUR" | "PLN" | "CZK" | "HUF" | "RON" | "SEK" | "DKK" | "BGN";

export const ALL_CURRENCIES: Currency[] = ["GBP", "EUR", "PLN", "CZK", "HUF", "RON", "SEK", "DKK", "BGN"];

export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  GBP: "£",
  EUR: "€",
  PLN: "zł",
  CZK: "Kč",
  HUF: "Ft",
  RON: "lei",
  SEK: "kr",
  DKK: "kr",
  BGN: "лв",
};

export const CURRENCY_LABELS: Record<Currency, string> = {
  GBP: "British Pound (£)",
  EUR: "Euro (€)",
  PLN: "Polish Złoty (zł)",
  CZK: "Czech Koruna (Kč)",
  HUF: "Hungarian Forint (Ft)",
  RON: "Romanian Leu (lei)",
  SEK: "Swedish Krona (kr)",
  DKK: "Danish Krone (kr)",
  BGN: "Bulgarian Lev (лв)",
};

export interface ExchangeRates {
  base: "GBP";
  rates: Record<string, number>;
  fetchedAt: string;
}

// Every cost is stored in GBP, always, permanently - these functions
// only ever affect what's shown or entered on screen. If cached rates
// haven't loaded for some reason, amounts safely fall back to GBP
// rather than showing something broken.
// NOTE: this file is imported by client components (the logging
// forms), so it must never import anything Cosmos/server-only - that
// belongs in currencyRates.ts instead.
export function convertGbpToDisplay(amountGbp: number, currency: Currency, rates: ExchangeRates | null): number {
  if (currency === "GBP" || !rates) return amountGbp;
  const rate = rates.rates[currency];
  if (!rate) return amountGbp;
  return amountGbp * rate;
}

export function convertDisplayToGbp(amount: number, currency: Currency, rates: ExchangeRates | null): number {
  const round = (n: number) => Math.round(n * 100) / 100;
  if (currency === "GBP" || !rates) return round(amount);
  const rate = rates.rates[currency];
  if (!rate) return round(amount);
  return round(amount / rate);
}

export function formatCurrency(amountGbp: number, currency: Currency, rates: ExchangeRates | null): string {
  const value = convertGbpToDisplay(amountGbp, currency, rates);
  return `${CURRENCY_SYMBOLS[currency]}${value.toFixed(0)}`;
}
