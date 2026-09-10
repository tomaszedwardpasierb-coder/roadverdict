// Place at: src/lib/payments/pricing.ts
//
// Single source of truth for the Independent Vehicle Check's one-time
// price, shared by the checkout-session creation route and the report
// page's own "Unlock" CTA, so the two can never drift apart.
import type { VehicleKind } from "@/lib/tracker/vdiUnlock";

export const VDI_CHECK_PRICE_PENCE: Record<VehicleKind, number> = {
  bike: 799,
  car: 999,
};

export const VDI_CHECK_PRICE_LABEL: Record<VehicleKind, string> = {
  bike: "£7.99",
  car: "£9.99",
};

export const VDI_CHECK_PRODUCT_NAME: Record<VehicleKind, string> = {
  bike: "RoadVerdict Independent Vehicle Check (motorcycle)",
  car: "RoadVerdict Independent Vehicle Check (car)",
};
