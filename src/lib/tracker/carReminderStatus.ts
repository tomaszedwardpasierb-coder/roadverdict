// Place at: src/lib/tracker/carReminderStatus.ts
//
// Car equivalent of reminderStatus.ts - same "ZERO dependency on
// cosmos.ts, even indirectly" reasoning applies here too: carReminder.ts
// imports the Cosmos SDK at its top level, so these two small, pure
// status/label functions live in their own file so a client component
// can use them without pulling that SDK into its bundle. Only type-only
// imports from carReminder.ts, erased at compile time.
import type { CarReminderDoc, CarReminderTrigger } from "./carReminder";

function triggerStatus(t: CarReminderTrigger, r: CarReminderDoc, currentMileage: number): "ok" | "due-soon" | "overdue" {
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
    const months = (new Date().getFullYear() - new Date(r.date).getFullYear()) * 12 + (new Date().getMonth() - new Date(r.date).getMonth());
    pct = months / t.intervalValue;
  }
  if (pct >= 1) return "overdue";
  if (pct >= 0.85) return "due-soon";
  return "ok";
}

const STATUS_RANK: Record<"ok" | "due-soon" | "overdue", number> = { ok: 0, "due-soon": 1, overdue: 2 };

export function computeCarReminderStatus(r: CarReminderDoc, currentMileage: number): "ok" | "due-soon" | "overdue" {
  const primary: CarReminderTrigger = { intervalType: r.intervalType, intervalValue: r.intervalValue, exactDate: r.exactDate };
  const all = [primary, ...(r.additionalTriggers ?? [])];
  let worst: "ok" | "due-soon" | "overdue" = "ok";
  for (const t of all) {
    const s = triggerStatus(t, r, currentMileage);
    if (STATUS_RANK[s] > STATUS_RANK[worst]) worst = s;
  }
  return worst;
}

function triggerDetail(t: CarReminderTrigger, r: CarReminderDoc): string {
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

export function carReminderDetailLabel(r: CarReminderDoc): string {
  const primary: CarReminderTrigger = { intervalType: r.intervalType, intervalValue: r.intervalValue, exactDate: r.exactDate };
  const all = [primary, ...(r.additionalTriggers ?? [])];
  const details = all.map((t) => triggerDetail(t, r)).filter(Boolean);
  if (details.length === 0) return "";
  if (details.length === 1) return `due ${details[0]}`;
  return `due ${details.join(", or ")} - whichever comes first`;
}
