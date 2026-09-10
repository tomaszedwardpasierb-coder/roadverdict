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

// The Buying Guide's paid vehicle-history report (VDI check + the free
// checklist/MOT-history/AI-briefing above it, which already becomes a
// fuller report the moment a VDI check is present - see
// buyingGuideBriefing.ts). Account-aware, tiered pricing rather than one
// flat price for everyone (see buyingGuideReportTier.ts for how a tier
// is chosen): Pro subscribers get one free every 4 weeks (see
// vehicleHistoryReportUsage.ts) and pay this "pro" price only to bypass
// that wait; free-tier pricing then depends on whether the account has
// at least one active vehicle registered, as an incentive to sign up
// and log one.
export type BuyingGuideReportTier = "pro" | "freeWithVehicle" | "freeNoVehicle";

export const BUYING_GUIDE_REPORT_PRICE_PENCE: Record<BuyingGuideReportTier, number> = {
  pro: 999,
  freeWithVehicle: 1299,
  freeNoVehicle: 1499,
};

export const BUYING_GUIDE_REPORT_PRICE_LABEL: Record<BuyingGuideReportTier, string> = {
  pro: "£9.99",
  freeWithVehicle: "£12.99",
  freeNoVehicle: "£14.99",
};

export const PRO_FREE_REPORT_COOLDOWN_MS = 28 * 24 * 60 * 60 * 1000;

export const BUYING_GUIDE_REPORT_PRODUCT_NAME: Record<VehicleKind, string> = {
  bike: "RoadVerdict Vehicle History Report (motorcycle)",
  car: "RoadVerdict Vehicle History Report (car)",
};
