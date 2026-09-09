// Place at: src/lib/tracker/carJobTypes.ts
//
// The car equivalent of jobTypes.ts's JOB_LABELS - almost no overlap
// with the motorcycle list (see the ADR's divergence table). "other" is
// the safe universal fallback, same role it plays for motorcycles.
import type { CarJobType } from "@/lib/carPriceData";

export const CAR_JOB_LABELS: Record<string, string> = {
  "oil-filter": "Oil & filter change",
  "interim-service": "Interim service",
  "full-service": "Full service",
  "brake-pads-front": "Brake pads (front)",
  "brake-pads-rear": "Brake pads (rear)",
  "brake-discs": "Brake discs",
  "tyres-full-set": "Tyres (full set)",
  "tyres-front-pair": "Tyres (front pair)",
  "tyres-rear-pair": "Tyres (rear pair)",
  "tyres-single": "Single tyre",
  "cambelt": "Cambelt / timing belt replacement",
  "timing-chain": "Timing chain service",
  "clutch": "Clutch replacement",
  "battery-12v": "12V battery",
  "battery-hv": "High-voltage battery service (EV/PHEV)",
  "aircon-regas": "Air conditioning regas",
  "dpf-clean": "DPF cleaning",
  "gearbox-oil": "Gearbox oil change",
  "coolant-flush": "Coolant flush",
  "brake-fluid-flush": "Brake fluid flush",
  "spark-plugs": "Spark plugs",
  "air-filter": "Air filter",
  "cabin-filter": "Cabin / pollen filter",
  "wheel-alignment": "Wheel alignment / tracking",
  "mot-advisory": "MOT advisory repair",
  "bodywork": "Bodywork / paint repair",
  "windscreen": "Windscreen repair or replacement",
  "other": "Other",
};

// The car equivalent of jobTypes.ts's JOB_GROUPS - every CAR_JOB_LABELS
// key appears in exactly one group here, same invariant the motorcycle
// list keeps.
export const CAR_JOB_GROUPS: { group: string; jobs: string[] }[] = [
  { group: "Servicing", jobs: ["oil-filter", "interim-service", "full-service"] },
  { group: "Engine & ignition", jobs: ["spark-plugs", "air-filter", "cabin-filter"] },
  { group: "Fluids", jobs: ["coolant-flush", "brake-fluid-flush", "gearbox-oil"] },
  { group: "Brakes", jobs: ["brake-pads-front", "brake-pads-rear", "brake-discs"] },
  { group: "Tyres", jobs: ["tyres-full-set", "tyres-front-pair", "tyres-rear-pair", "tyres-single", "wheel-alignment"] },
  { group: "Drivetrain", jobs: ["cambelt", "timing-chain", "clutch"] },
  { group: "Electrical & climate", jobs: ["battery-12v", "battery-hv", "aircon-regas"] },
  { group: "Emissions", jobs: ["dpf-clean"] },
  { group: "Bodywork & glass", jobs: ["mot-advisory", "bodywork", "windscreen"] },
  { group: "Other", jobs: ["other"] },
];

export const CAR_JOB_REMINDER_DEFAULTS: Record<string, { type: "mileage" | "months"; value: number; note?: string }> = {
  "oil-filter": { type: "mileage", value: 10000 },
  "interim-service": { type: "mileage", value: 6000 },
  "full-service": { type: "mileage", value: 12000 },
  "brake-fluid-flush": { type: "months", value: 24, note: "Time-based, not mileage - brake fluid absorbs moisture from the air regardless of use." },
  "coolant-flush": { type: "months", value: 24 },
  "cambelt": { type: "mileage", value: 60000, note: "Varies a lot by make/model - always check your manufacturer's handbook for the real interval." },
  "aircon-regas": { type: "months", value: 24 },
  "cabin-filter": { type: "mileage", value: 12000 },
  "air-filter": { type: "mileage", value: 20000 },
  "spark-plugs": { type: "mileage", value: 30000 },
  "battery-12v": { type: "months", value: 48 },
};

// Populated once Phase 7's price research landed (see carPriceData.ts's
// CAR_BENCHMARKS for the sourced figures behind each of these 5 - every
// key here has a real, sourced, dated benchmark behind it, matching this
// array's own original discipline: no guessed numbers wearing a
// confidence label). Deliberately narrower than the full CAR_JOB_LABELS
// catalog above - electric-car servicing and every job type beyond these
// five still has no sourced benchmark.
export const CAR_BENCHMARKED_JOB_TYPES: string[] = [
  "oil-filter",
  "interim-service",
  "full-service",
  "brake-pads-front",
  "tyres-front-pair",
];

// Mirrors jobTypes.ts's isBenchmarkedJob.
export function isBenchmarkedCarJob(jobType: string): jobType is CarJobType {
  return (CAR_BENCHMARKED_JOB_TYPES as string[]).includes(jobType);
}
