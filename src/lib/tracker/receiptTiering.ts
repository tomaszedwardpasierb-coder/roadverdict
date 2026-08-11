// Place at: src/lib/tracker/receiptTiering.ts
//
// A receipt with both a date and a printed mileage needs no estimation
// at all - it's a fact, not a guess. A fuel receipt with no mileage
// needs the most help of anything in a batch, since mileage is the
// entire input to the MPG chain. Processing strong anchors first within
// each category means that by the time the weakest tier is reached, the
// maximum possible number of real anchors already exist to interpolate
// between - not just whatever happened to come earlier by date in a
// single chronological pass. Category comes first, though: every
// non-fuel receipt (service, mods, bills) is processed before any fuel
// receipt, even a fuel one with its own printed mileage - a deliberate
// choice, not a side effect of anchor strength.

export type ReceiptTier = 1 | 2 | 4 | 6;

export interface TierableItem {
  category: "service" | "fuel" | "mods" | "bills";
  mileageOnReceipt: number | null;
}

// date is guaranteed present on every ParsedReceiptItem (required, not
// optional, in receiptParse.ts), so there's no "no date at all" case to
// handle here - it genuinely can't occur.
export function classifyReceiptTier(item: TierableItem): ReceiptTier {
  const hasMileage = typeof item.mileageOnReceipt === "number";
  const isFuel = item.category === "fuel";
  if (!isFuel) return hasMileage ? 1 : 2;
  return hasMileage ? 4 : 6;
}

// 1 before 2 before 4 before 6, matching the confirmed design - every
// non-fuel tier goes before every fuel tier, full stop; strong-anchor-
// first only decides order WITHIN each of those two groups (1 before 2,
// 4 before 6). Tier 4 is still auto-commit-eligible like tier 1 (see
// isAutoCommitTier below) - this only changes when it's processed, not
// whether it still needs a human.
const TIER_SORT_ORDER: Record<ReceiptTier, number> = { 1: 0, 2: 1, 4: 2, 6: 3 };

export function receiptTierSortWeight(tier: ReceiptTier): number {
  return TIER_SORT_ORDER[tier];
}

// Only tiers 1 and 4 are auto-commit candidates - a receipt with a
// printed mileage needs a human only if something else about it is
// wrong (a duplicate, a currency conversion that couldn't complete, or
// - for fuel specifically - a mileage that conflicts with the rest of
// the timeline). Tier 2 stays human-reviewed even though mileage is
// optional there, since cost and category still benefit from a glance.
export function isAutoCommitTier(tier: ReceiptTier): boolean {
  return tier === 1 || tier === 4;
}
