// Place at: src/lib/tracker/consumablesDueSoon.ts
//
// Deliberately independent of the reminder system, not a duplicate of
// it - a reminder can be deleted, edited, or (for genuinely old,
// backfilled history) never created in the first place, but the
// service record itself and the same default interval this app already
// uses to auto-create reminders are enough to answer "is this bike
// about to need one of its known consumables" on their own. If an
// active reminder for the same job also exists, the caller should
// prefer that one and skip this - this is the fallback source, not the
// primary one.

import { JOB_REMINDER_DEFAULTS, JOB_LABELS } from "./jobTypes";

export interface ServiceHistoryPoint {
  jobType: string;
  mileage: number;
  date: string;
}

export interface ConsumableDueSoon {
  jobType: string;
  label: string;
  lastDoneMileage: number;
  lastDoneDate: string;
  intervalMiles?: number;
  intervalMonths?: number;
  status: "due-soon" | "overdue";
}

const DUE_SOON_THRESHOLD = 0.85; // matches reminderStatus.ts's own due-soon threshold, same meaning here

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function findConsumablesDueSoon(
  history: ServiceHistoryPoint[],
  currentMileage: number,
  excludeJobTypes: Set<string> = new Set()
): ConsumableDueSoon[] {
  // Only the most recent occurrence of each job type matters - an
  // earlier chain replacement doesn't tell you anything once a later
  // one has happened.
  const latestByType = new Map<string, ServiceHistoryPoint>();
  for (const point of history) {
    const existing = latestByType.get(point.jobType);
    if (!existing || point.mileage > existing.mileage) latestByType.set(point.jobType, point);
  }

  const results: ConsumableDueSoon[] = [];
  for (const [jobType, last] of latestByType) {
    if (excludeJobTypes.has(jobType)) continue;
    const def = JOB_REMINDER_DEFAULTS[jobType];
    if (!def) continue;

    let pctElapsed = 0;
    if (def.type === "mileage") {
      pctElapsed = (currentMileage - last.mileage) / def.value;
    } else {
      pctElapsed = monthsBetween(new Date(last.date), new Date()) / def.value;
    }
    if (pctElapsed < DUE_SOON_THRESHOLD) continue;

    results.push({
      jobType,
      label: JOB_LABELS[jobType] ?? jobType,
      lastDoneMileage: last.mileage,
      lastDoneDate: last.date,
      intervalMiles: def.type === "mileage" ? def.value : undefined,
      intervalMonths: def.type === "months" ? def.value : undefined,
      status: pctElapsed >= 1 ? "overdue" : "due-soon",
    });
  }

  return results;
}
