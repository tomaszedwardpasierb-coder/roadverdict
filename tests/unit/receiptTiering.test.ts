import { describe, expect, it } from "vitest";
import { classifyReceiptTier, receiptTierSortWeight, isAutoCommitTier } from "@/lib/tracker/receiptTiering";

describe("classifyReceiptTier", () => {
  it("classifies a non-fuel item with a printed mileage as tier 1", () => {
    expect(classifyReceiptTier({ category: "service", mileageOnReceipt: 5000 })).toBe(1);
  });

  it("classifies a non-fuel item with no mileage as tier 2", () => {
    expect(classifyReceiptTier({ category: "mods", mileageOnReceipt: null })).toBe(2);
  });

  it("classifies a fuel item with a printed mileage as tier 4", () => {
    expect(classifyReceiptTier({ category: "fuel", mileageOnReceipt: 5000 })).toBe(4);
  });

  it("classifies a fuel item with no mileage as tier 6, needing the most help", () => {
    expect(classifyReceiptTier({ category: "fuel", mileageOnReceipt: null })).toBe(6);
  });
});

describe("receiptTierSortWeight", () => {
  // Every non-fuel tier before every fuel tier - not simply "strong
  // anchor first" across the whole set.
  it("orders every non-fuel tier before every fuel tier", () => {
    expect(receiptTierSortWeight(1)).toBeLessThan(receiptTierSortWeight(4));
    expect(receiptTierSortWeight(2)).toBeLessThan(receiptTierSortWeight(4));
  });

  it("orders the strong anchor before the weak one within each group", () => {
    expect(receiptTierSortWeight(1)).toBeLessThan(receiptTierSortWeight(2));
    expect(receiptTierSortWeight(4)).toBeLessThan(receiptTierSortWeight(6));
  });
});

describe("isAutoCommitTier", () => {
  it("only tiers 1 and 4 are auto-commit eligible", () => {
    expect(isAutoCommitTier(1)).toBe(true);
    expect(isAutoCommitTier(4)).toBe(true);
    expect(isAutoCommitTier(2)).toBe(false);
    expect(isAutoCommitTier(6)).toBe(false);
  });
});