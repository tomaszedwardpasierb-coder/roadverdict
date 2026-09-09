// Place at: src/lib/tracker/carConsumablesDueSoon.ts
//
// Car equivalent of consumablesDueSoon.ts - same "independent of the
// reminder system, not a duplicate of it" reasoning, just against the
// car job catalog (CAR_JOB_REMINDER_DEFAULTS/CAR_JOB_LABELS) instead of
// the motorcycle one.
import { CAR_JOB_REMINDER_DEFAULTS, CAR_JOB_LABELS } from "./carJobTypes";

export interface CarServiceHistoryPoint {
  jobType: string;
  mileage: number;
  date: string;
}

export interface CarConsumableDueSoon {
  jobType: string;
  label: string;
  lastDoneMileage: number;
  lastDoneDate: string;
  intervalMiles?: number;
  intervalMonths?: number;
  status: "due-soon" | "overdue";
}

const DUE_SOON_THRESHOLD = 0.85; // matches carReminderStatus.ts's own due-soon threshold, same meaning here

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function findCarConsumablesDueSoon(
  history: CarServiceHistoryPoint[],
  currentMileage: number,
  excludeJobTypes: Set<string> = new Set()
): CarConsumableDueSoon[] {
  // Only the most recent occurrence of each job type matters - an
  // earlier cambelt replacement doesn't tell you anything once a later
  // one has happened.
  const latestByType = new Map<string, CarServiceHistoryPoint>();
  for (const point of history) {
    const existing = latestByType.get(point.jobType);
    if (!existing || point.mileage > existing.mileage) latestByType.set(point.jobType, point);
  }

  const results: CarConsumableDueSoon[] = [];
  for (const [jobType, last] of latestByType) {
    if (excludeJobTypes.has(jobType)) continue;
    const def = CAR_JOB_REMINDER_DEFAULTS[jobType];
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
      label: CAR_JOB_LABELS[jobType] ?? jobType,
      lastDoneMileage: last.mileage,
      lastDoneDate: last.date,
      intervalMiles: def.type === "mileage" ? def.value : undefined,
      intervalMonths: def.type === "months" ? def.value : undefined,
      status: pctElapsed >= 1 ? "overdue" : "due-soon",
    });
  }

  return results;
}
