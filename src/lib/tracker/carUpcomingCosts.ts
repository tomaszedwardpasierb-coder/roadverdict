// Place at: src/lib/tracker/carUpcomingCosts.ts
//
// Car equivalent of upcomingCosts.ts - same "attaches a cost estimate,
// adds no new judgement about WHAT's due" reasoning, using
// getInflationAdjustedCarBenchmark (not getAdjustedCarBenchmark) for
// the same "brand/region don't belong in a report read by a stranger"
// reason that file's own comment gives.
import { isBenchmarkedCarJob } from "./carJobTypes";
import { carReminderDetailLabel } from "./carReminderStatus";
import type { CarReminderDoc } from "./carReminder";
import type { CarConsumableDueSoon } from "./carConsumablesDueSoon";
import { getInflationAdjustedCarBenchmark, type CarBenchmarkClass } from "@/lib/carPriceData";
import type { ConfidenceLevel } from "@/lib/priceData";

export interface CarUpcomingCostItem {
  jobType: string;
  label: string;
  timing: "overdue" | "due-soon";
  timingDetail: string;
  pricing:
    | { status: "priced"; low: number; high: number; confidence: ConfidenceLevel; sourceName: string; lastReviewed: string }
    | { status: "not-priced" };
}

function buildPricing(jobType: string, carClass: CarBenchmarkClass): CarUpcomingCostItem["pricing"] {
  if (!isBenchmarkedCarJob(jobType)) return { status: "not-priced" };
  const benchmark = getInflationAdjustedCarBenchmark(jobType, carClass);
  return {
    status: "priced",
    low: benchmark.low,
    high: benchmark.high,
    confidence: benchmark.source.confidence,
    sourceName: benchmark.source.sourceName,
    lastReviewed: benchmark.source.lastReviewed,
  };
}

export function buildCarUpcomingCostItems(
  upcomingReminders: { reminder: CarReminderDoc; status: "due-soon" | "overdue" }[],
  consumablesDueSoon: CarConsumableDueSoon[],
  carClass: CarBenchmarkClass
): CarUpcomingCostItem[] {
  const items: CarUpcomingCostItem[] = [];

  for (const { reminder, status } of upcomingReminders) {
    if (!reminder.sourceKey?.startsWith("service:")) continue;
    const jobType = reminder.sourceKey.slice("service:".length);
    items.push({
      jobType,
      label: reminder.name,
      timing: status,
      timingDetail: carReminderDetailLabel(reminder),
      pricing: buildPricing(jobType, carClass),
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
      pricing: buildPricing(c.jobType, carClass),
    });
  }

  return items;
}
