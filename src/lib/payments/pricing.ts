// Place at: src/lib/payments/pricing.ts
//
// Single source of truth for the two, separately-priced independent
// vehicle-check features, shared by their checkout-session creation and
// their UI's own CTA copy, so the two can never drift apart.
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";

// One-time unlock on the shared buyer report (report/[token]/detailed,
// car-report/[token]/detailed) - bundles VDICheck + (car only)
// ValuationDetails. Priced higher than the Buying Guide's own VDI-only
// purchase below because it includes the valuation and sits on a page
// the buyer has already committed to (they've been sent this exact
// link about this exact vehicle), not a speculative pre-purchase check.
export const VDI_CHECK_PRICE_PENCE: Record<VehicleKind, number> = {
  bike: 999,
  car: 1399,
};

export const VDI_CHECK_PRICE_LABEL: Record<VehicleKind, string> = {
  bike: "£9.99",
  car: "£13.99",
};

export const VDI_CHECK_PRODUCT_NAME: Record<VehicleKind, string> = {
  bike: "RoadVerdict Independent Vehicle Check (motorcycle)",
  car: "RoadVerdict Independent Vehicle Check (car)",
};

// Standalone, pay-per-use VDI check inside the free Buying Guide plate
// lookup - no free tier, no Pro perk, same flat price for bike and car
// (see vdiPurchase.ts). Deliberately cheaper than the report-unlock
// price above: this is VDICheck alone, no valuation bundled in - the
// Buying Guide's independent valuation (car only) is its own free,
// rate-limited feature instead (see valuationCheckUsage.ts).
export const BUYING_GUIDE_VDI_CHECK_PRICE_PENCE = 999;
export const BUYING_GUIDE_VDI_CHECK_PRICE_LABEL = "£9.99";

export const BUYING_GUIDE_VDI_CHECK_PRODUCT_NAME: Record<VehicleKind, string> = {
  bike: "RoadVerdict Independent Vehicle Check - Buying Guide (motorcycle)",
  car: "RoadVerdict Independent Vehicle Check - Buying Guide (car)",
};
