// Place at: src/lib/tracker/jobTypes.ts
import type { JobType } from "@/lib/priceData";

export const JOB_LABELS: Record<string, string> = {
  "basic-service": "Basic service",
  "full-service": "Full service",
  "oil-filter": "Oil & filter change",
  "spark-plugs": "Spark plugs",
  "valve-clearance": "Valve clearance check/adjustment",
  "air-filter": "Air filter",
  "coolant-flush": "Coolant flush",
  "brake-fluid-flush": "Brake fluid flush",
  "brake-pads-front": "Brake pads (front)",
  "brake-pads-rear": "Brake pads (rear)",
  "tyres-pair": "Tyres (pair)",
  "tyres-front": "Tyres (front only)",
  "tyres-rear": "Tyres (rear only)",
  "chain-and-sprockets": "Chain and sprockets",
  "drive-belt": "Drive belt",
  "battery": "Battery",
  "other": "Other",
};

export const JOB_GROUPS: { group: string; jobs: string[] }[] = [
  { group: "Servicing", jobs: ["basic-service", "full-service", "oil-filter"] },
  { group: "Engine & ignition", jobs: ["spark-plugs", "valve-clearance", "air-filter"] },
  { group: "Fluids", jobs: ["coolant-flush", "brake-fluid-flush"] },
  { group: "Brakes", jobs: ["brake-pads-front", "brake-pads-rear"] },
  { group: "Tyres", jobs: ["tyres-pair", "tyres-front", "tyres-rear"] },
  { group: "Drivetrain", jobs: ["chain-and-sprockets", "drive-belt"] },
  { group: "Other", jobs: ["battery", "other"] },
];

export const BENCHMARKED_JOB_TYPES: JobType[] = [
  "basic-service",
  "full-service",
  "tyres-pair",
  "brake-pads-front",
  "chain-and-sprockets",
];

export function isBenchmarkedJob(jobType: string): jobType is JobType {
  return (BENCHMARKED_JOB_TYPES as string[]).includes(jobType);
}

export const AFFILIATE_LINKS: Record<string, { name: string; url: string }[]> = {
  "tyres-pair": [
    { name: "moto-tyres.co.uk", url: "https://www.moto-tyres.co.uk" },
    { name: "mytyres.co.uk", url: "https://www.mytyres.co.uk" },
  ],
  "tyres-front": [
    { name: "moto-tyres.co.uk", url: "https://www.moto-tyres.co.uk" },
    { name: "mytyres.co.uk", url: "https://www.mytyres.co.uk" },
  ],
  "tyres-rear": [
    { name: "moto-tyres.co.uk", url: "https://www.moto-tyres.co.uk" },
    { name: "mytyres.co.uk", url: "https://www.mytyres.co.uk" },
  ],
  "chain-and-sprockets": [
    { name: "GhostBikes.com", url: "https://www.ghostbikes.com" },
    { name: "The Green Spark Plug Co", url: "https://www.greensparkplug.co.uk" },
  ],
};

// Default reminder interval offered when logging each job - typical
// starting points from general motorcycle maintenance guides, NOT
// model-specific. Always editable. "other" has no default - too vague to
// guess at.
export const JOB_REMINDER_DEFAULTS: Record<string, { type: "mileage" | "months"; value: number; note?: string }> = {
  "oil-filter": { type: "mileage", value: 4000 },
  "full-service": { type: "mileage", value: 6000 },
  "basic-service": { type: "mileage", value: 4000 },
  "spark-plugs": { type: "mileage", value: 10000 },
  "valve-clearance": { type: "mileage", value: 12000, note: "Varies hugely by bike (6,000-25,000+ mi). Check your owner's manual for the real figure." },
  "air-filter": { type: "mileage", value: 12000 },
  "coolant-flush": { type: "months", value: 24 },
  "brake-fluid-flush": { type: "months", value: 24, note: "Time-based, not mileage - brake fluid absorbs moisture from the air regardless of use." },
  "brake-pads-front": { type: "mileage", value: 12000 },
  "brake-pads-rear": { type: "mileage", value: 14000 },
  "tyres-pair": { type: "mileage", value: 5000 },
  "tyres-front": { type: "mileage", value: 6000 },
  "tyres-rear": { type: "mileage", value: 5000 },
  "chain-and-sprockets": { type: "mileage", value: 15000 },
  "drive-belt": { type: "mileage", value: 20000 },
  "battery": { type: "months", value: 36 },
};
