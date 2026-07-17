// Place at: src/lib/tracker/jobTypes.ts
import type { JobType } from "@/lib/priceData";

// Expanded to match what real maintenance-tracker competitors cover
// (Drivvo, MotorManage, AUTOsist), same list as the local prototype. Only
// the 5 in BENCHMARKED_JOB_TYPES have real UK price data behind them (see
// priceData.ts) - the rest log cost honestly with no fair/high claim.
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
