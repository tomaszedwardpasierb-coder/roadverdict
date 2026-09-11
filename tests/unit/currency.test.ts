import { describe, expect, it } from "vitest";
import { convertGbpToDisplay, convertDisplayToGbp, formatCurrency, type ExchangeRates } from "@/lib/tracker/currency";

const rates: ExchangeRates = { base: "GBP", rates: { EUR: 1.17 }, fetchedAt: "2025-06-01" };

describe("convertGbpToDisplay", () => {
  it("passes GBP straight through unchanged", () => {
    expect(convertGbpToDisplay(100, "GBP", rates)).toBe(100);
  });

  it("converts using the real rate for a supported currency", () => {
    expect(convertGbpToDisplay(100, "EUR", rates)).toBeCloseTo(117, 5);
  });

  it("falls back to the unconverted amount when no rates are available at all", () => {
    expect(convertGbpToDisplay(100, "EUR", null)).toBe(100);
  });

  it("falls back to the unconverted amount when this specific currency has no rate in the object", () => {
    expect(convertGbpToDisplay(100, "PLN", rates)).toBe(100);
  });
});

describe("convertDisplayToGbp", () => {
  it("rounds a GBP amount to 2 decimal places", () => {
    expect(convertDisplayToGbp(19.999, "GBP", rates)).toBe(20);
  });

  it("converts a foreign amount back to GBP and rounds it", () => {
    expect(convertDisplayToGbp(46.8, "EUR", rates)).toBe(40);
  });

  it("falls back to the raw (rounded) amount when no rates are available", () => {
    expect(convertDisplayToGbp(50, "EUR", null)).toBe(50);
  });
});

describe("formatCurrency", () => {
  it("formats with the currency's own symbol and 2 decimal places", () => {
    expect(formatCurrency(100, "GBP", rates)).toBe("£100.00");
  });

  it("converts before formatting for a non-GBP currency", () => {
    expect(formatCurrency(100, "EUR", rates)).toBe("€117.00");
  });

  // The actual bug this pins: a logged cost of 14.65 was rendering as
  // "£15" (toFixed(0) rounding it to a whole pound) even though the
  // stored value was always exactly 14.65 - purely a display bug, but
  // one that reads to a user as "it saved the wrong amount."
  it("never rounds a fractional cost to a whole number", () => {
    expect(formatCurrency(14.65, "GBP", rates)).toBe("£14.65");
  });
});