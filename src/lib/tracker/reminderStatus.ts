// Place at: src/lib/tracker/reminderStatus.ts
//
// Deliberately has ZERO dependency on cosmos.ts or cosmosHelpers.ts, even
// indirectly. reminder.ts imports the Cosmos SDK at its top level (needed
// for its data-layer functions), so importing ANYTHING from it as a VALUE
// - even one small formatting function - drags the whole SDK into any
// client bundle that does so. This file exists so client components can
// get status/label logic without that cost. Only type-only imports from
// reminder.ts are safe from any file (those are erased at compile time);
// this file's own imports below are type-only for exactly that reason.
import type { ReminderDoc, ReminderTrigger } from "./reminder";

export function monthsBetween(d1: Date, d2: Date): number {
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

function triggerStatus(t: ReminderTrigger, r: ReminderDoc, currentMileage: number): "ok" | "due-soon" | "overdue" {
  if (t.intervalType === "date" && t.exactDate) {
    const daysRemaining = (new Date(t.exactDate).getTime() - Date.now()) / 86400000;
    if (daysRemaining <= 0) return "overdue";
    if (daysRemaining <= 14) return "due-soon";
    return "ok";
  }
  let pct = 0;
  if (t.intervalType === "mileage" && t.intervalValue) {
    pct = (currentMileage - (r.baseMileage ?? 0)) / t.intervalValue;
  } else if (t.intervalType === "months" && t.intervalValue) {
    const months = monthsBetween(new Date(r.date), new Date());
    pct = months / t.intervalValue;
  }
  if (pct >= 1) return "overdue";
  if (pct >= 0.85) return "due-soon";
  return "ok";
}

const STATUS_RANK: Record<"ok" | "due-soon" | "overdue", number> = { ok: 0, "due-soon": 1, overdue: 2 };

// "Whichever comes first" means the reminder should feel urgent the
// moment ANY trigger is close/overdue, not wait for every one of them -
// so the overall status is the most urgent of the whole set, not an
// average or the primary trigger alone.
export function computeReminderStatus(r: ReminderDoc, currentMileage: number): "ok" | "due-soon" | "overdue" {
  const primary: ReminderTrigger = { intervalType: r.intervalType, intervalValue: r.intervalValue, exactDate: r.exactDate };
  const all = [primary, ...(r.additionalTriggers ?? [])];
  let worst: "ok" | "due-soon" | "overdue" = "ok";
  for (const t of all) {
    const s = triggerStatus(t, r, currentMileage);
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

function triggerDetail(t: ReminderTrigger, r: ReminderDoc): string {
  if (t.intervalType === "date" && t.exactDate) {
    return `on ${new Date(t.exactDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  }
  if (t.intervalType === "mileage" && t.intervalValue) {
    const due = (r.baseMileage ?? 0) + t.intervalValue;
    return `around ${due.toLocaleString()} miles (every ${t.intervalValue.toLocaleString()} mi)`;
  }
  if (t.intervalType === "months" && t.intervalValue) {
    const base = new Date(r.date);
    const due = new Date(base.getFullYear(), base.getMonth() + t.intervalValue, base.getDate());
    return `around ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} (every ${t.intervalValue} months)`;
  }
  return "";
}

// Single-trigger wording is byte-for-byte the same as it always was -
// every existing reminder displays exactly as it always has. Multiple
// triggers join with "or" and an explicit "whichever comes first".
export function reminderDetailLabel(r: ReminderDoc): string {
  const primary: ReminderTrigger = { intervalType: r.intervalType, intervalValue: r.intervalValue, exactDate: r.exactDate };
  const all = [primary, ...(r.additionalTriggers ?? [])];
  const details = all.map((t) => triggerDetail(t, r)).filter(Boolean);
  if (details.length === 0) return "";
  if (details.length === 1) return `due ${details[0]}`;
  return `due ${details.join(", or ")} - whichever comes first`;
}
