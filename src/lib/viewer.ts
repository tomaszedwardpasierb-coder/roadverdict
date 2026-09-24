// Place at: src/lib/viewer.ts
//
// Shared shape + cookie names for the "viewer" lookup that replaced
// server-side session reads on the public, cacheable pages. Pure
// constants and types only - imported by middleware (edge runtime),
// the /api/viewer route, and client components alike, so nothing here
// may pull in Cosmos or any Node-only module.
import type { CarBenchmarkClass } from "@/lib/carPriceData";

export type BikeSizeClass = "small" | "medium" | "large";

export interface ViewerBike {
  brand: string;
  bikeClass: BikeSizeClass;
  model?: string;
}

export interface ViewerCar {
  brand: string;
  carClass?: CarBenchmarkClass;
}

export interface ViewerInfo {
  signedIn: boolean;
  hasBike: boolean;
  hasCar: boolean;
  bike?: ViewerBike;
  car?: ViewerCar;
}

export const ANONYMOUS_VIEWER: ViewerInfo = { signedIn: false, hasBike: false, hasCar: false };

// Non-httpOnly mirrors of httpOnly cookies, kept in sync by middleware.
// They carry no secret - only "a session cookie exists" / "an impersonation
// cookie exists" - so client code can decide whether a network request is
// worth making at all, instead of every anonymous visitor paying for one.
export const AUTH_MARKER_COOKIE = "rv_auth";
export const IMPERSONATION_MARKER_COOKIE = "rv_imp";
