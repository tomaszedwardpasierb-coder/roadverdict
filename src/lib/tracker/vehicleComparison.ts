// Place at: src/lib/tracker/vehicleComparison.ts
//
// The shared shape the garage compare page's table renders, covering
// BOTH a bike's comparison entry (bikeComparison.ts) and a car's
// (carComparison.ts) side by side in the same rows - the one place in
// this app where mixing the two kinds together is the whole point,
// rather than something the sister-schema architecture avoids.
//
// The `bikeId` field name is kept (not renamed to something neutral
// like `id`) deliberately: it holds either a bike's or a car's real id,
// but bikeComparisonVerdict.ts's pickWinnerId/ComparisonCostInput (also
// used, unmodified, by the AI assistant's own bike-only "compare bikes"
// tool - see assistantTools.ts) already key off that exact field name.
// Renaming it would mean touching that shared, already-tested utility
// and the assistant tool alongside it, for a purely cosmetic gain.
import { MIN_COMPARE_BIKES, MAX_COMPARE_BIKES } from "./bikeComparison";
import type { SpendSummary } from "./summary";

export const MIN_COMPARE_VEHICLES = MIN_COMPARE_BIKES;
export const MAX_COMPARE_VEHICLES = MAX_COMPARE_BIKES;

export interface VehicleComparisonEntry {
  bikeId: string;
  kind: "bike" | "car";
  name: string;
  year?: number;
  isCustomBuild?: boolean;
  currentMileage: number;
  milesRidden: number;
  ownedSince: string;
  monthsOwned: number;
  milesPerMonth: number | null;
  spend: SpendSummary;
  yearSpend: number | null;
  costPerMile: number | null;
  actualMpg: number | null;
  serviceCount: number;
  lastServiceDate: string | null;
  lastServiceMileage: number | null;
  nextDue: { name: string; status: "due-soon" | "overdue" } | null;
  // null specifically means "not tracked for this vehicle kind yet" (see
  // carComparison.ts - cars have no getSellerReportCore equivalent yet),
  // distinct from a real bike entry's genuine 0.
  documentationPct: number | null;
}
