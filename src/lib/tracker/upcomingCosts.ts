// Place at: src/lib/tracker/upcomingCosts.ts
//
// Attaches a cost estimate to items the report already knows are
// coming up (from upcomingReminders and consumablesDueSoon, computed
// elsewhere) - this module adds no new judgement about WHAT's due,
// only WHAT IT MIGHT COST, and only where priceData.ts actually has a
// real benchmark for that exact job type. Deliberately uses
// getInflationAdjustedBenchmark(), not getAdjustedBenchmark() - see
// that function's own comment in priceData.ts for why the brand and
// region multipliers don't belong in a report read by a stranger who
// might spend real money on the strength of it.
import { isBenchmarkedJob } from "./jobTypes";
import { reminderDetailLabel } from "./reminderStatus";
import type { ReminderDoc } from "./reminder";
import type { ConsumableDueSoon } from "./consumablesDueSoon";
import { getInflationAdjustedBenchmark, type BikeClass, type ConfidenceLevel } from "@/lib/priceData";

export interface UpcomingCostItem {
  jobType: string;
  label: string;
  timing: "overdue" | "due-soon";
  timingDetail: string;
  pricing:
    | { status: "priced"; low: number; high: number; confidence: ConfidenceLevel; sourceName: string; lastReviewed: string }
    | { status: "not-priced" };
}

function buildPricing(jobType: string, bikeClass: BikeClass): UpcomingCostItem["pricing"] {
  if (!isBenchmarkedJob(jobType)) return { status: "not-priced" };
  const benchmark = getInflationAdjustedBenchmark(jobType, bikeClass);
  return {
    status: "priced",
    low: benchmark.low,
    high: benchmark.high,
    confidence: benchmark.source.confidence,
    sourceName: benchmark.source.sourceName,
    lastReviewed: benchmark.source.lastReviewed,
  };
}

export function buildUpcomingCostItems(
  upcomingReminders: { reminder: ReminderDoc; status: "due-soon" | "overdue" }[],
  consumablesDueSoon: ConsumableDueSoon[],
  bikeClass: BikeClass
): UpcomingCostItem[] {
  const items: UpcomingCostItem[] = [];

  for (const { reminder, status } of upcomingReminders) {
    if (!reminder.sourceKey?.startsWith("service:")) continue;
    const jobType = reminder.sourceKey.slice("service:".length);
    items.push({
      jobType,
      label: reminder.name,
      timing: status,
      timingDetail: reminderDetailLabel(reminder),
      pricing: buildPricing(jobType, bikeClass),
    });
  }

  for (const c of consumablesDueSoon) {
    const intervalNote = c.intervalMiles
      ? `, typically due again every ${c.intervalMiles.toLocaleString()} mi`
      : "";
    items.push({
      jobType: c.jobType,
      label: c.label,
      timing: c.status,
      timingDetail: `last done at ${c.lastDoneMileage.toLocaleString()} mi${intervalNote}`,
      pricing: buildPricing(c.jobType, bikeClass),
    });
  }

  return items;
}