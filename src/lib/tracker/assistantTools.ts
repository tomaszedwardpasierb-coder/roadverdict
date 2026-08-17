// Place at: src/lib/tracker/assistantTools.ts
//
// Every function here takes an `email` that comes from the caller's own
// server-side session - never a parameter the AI model supplies. That's
// not a convention to remember, it's the entire safety property this
// file exists to provide: there is no function signature below that
// accepts "which account to look up" as an argument, so there is
// nothing for a cleverly-worded request to talk its way around. See
// knowledge base section 5. The API route (route.ts) is the only place
// `email` is ever read from - always `session.email`, never the
// request body, never a model-supplied argument.

import { getPrimaryBike } from "./bike";
import { getServiceRecords } from "./serviceRecord";
import { getMods } from "./mod";
import { getBills } from "./bill";
import { getFuelLogs } from "./fuelLog";
import { getReminders } from "./reminder";
import { computeReminderStatus, reminderDetailLabel } from "./reminderStatus";
import { computeActualMPG, computeMPGSeries } from "./mpgCalc";
import { gatherMileagePoints } from "./summary";
import { JOB_LABELS } from "./jobTypes";

type CostItem = { date: string; cost: number };

function inRange(dateStr: string, start?: string, end?: string): boolean {
  const t = new Date(dateStr).getTime();
  if (start && t < new Date(start).getTime()) return false;
  if (end && t > new Date(end).getTime()) return false;
  return true;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---- Spend total, optionally by category and/or date range ----

export interface SpendTotalArgs {
  startDate?: string;
  endDate?: string;
  category?: "servicing" | "fuel" | "mods" | "bills";
}

export async function toolGetSpendTotal(email: string, args: SpendTotalArgs) {
  const bike = await getPrimaryBike(email);
  if (!bike) return { error: "No bike found on this account." };

  const [records, mods, fuelLogs, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
    getBills(email, bike.id),
  ]);

  const sets: Record<string, CostItem[]> = { servicing: records, mods, fuel: fuelLogs, bills };
  const chosen: CostItem[] = args.category ? (sets[args.category] ?? []) : [...records, ...mods, ...fuelLogs, ...bills];
  const filtered = chosen.filter((x) => inRange(x.date, args.startDate, args.endDate));

  return {
    total: round2(filtered.reduce((s, x) => s + x.cost, 0)),
    currency: bike.currency ?? "GBP",
    entryCount: filtered.length,
    category: args.category ?? "all",
  };
}

// ---- Current mileage, or the closest logged mileage to a given date ----

export interface MileageArgs {
  atDate?: string;
}

export async function toolGetMileage(email: string, args: MileageArgs) {
  const bike = await getPrimaryBike(email);
  if (!bike) return { error: "No bike found on this account." };

  if (!args.atDate) {
    return { mileage: bike.currentMileage, asOf: "current" };
  }

  const [records, mods, fuelLogs] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
  ]);
  const points = gatherMileagePoints(records, mods, fuelLogs);
  if (points.length === 0) return { error: "No mileage history logged yet." };

  // Closest logged point to the requested date, not an interpolation -
  // an approximate but honestly-labelled answer, never a fabricated
  // exact figure for a date nothing was actually logged on.
  const target = new Date(args.atDate).getTime();
  let closest = points[0];
  let closestDiff = Math.abs(new Date(points[0].date).getTime() - target);
  for (const p of points) {
    const diff = Math.abs(new Date(p.date).getTime() - target);
    if (diff < closestDiff) {
      closest = p;
      closestDiff = diff;
    }
  }
  return { mileage: closest.mileage, asOf: closest.date, note: "Closest logged reading to the date asked about, not the exact date itself unless they match." };
}

// ---- Actual fuel economy and its recent trend ----

export async function toolGetMpgTrend(email: string) {
  const bike = await getPrimaryBike(email);
  if (!bike) return { error: "No bike found on this account." };

  const fuelLogs = await getFuelLogs(email, bike.id);
  const officialMpg = bike.dvlaData?.officialCombinedMpg;
  const overall = computeActualMPG(fuelLogs, officialMpg);
  if (overall === null) {
    return { hasEnoughData: false, reason: "Needs at least two consecutive full-tank fill-ups logged." };
  }

  const series = computeMPGSeries(fuelLogs, officialMpg);
  const validSegments = series.filter((s) => !s.exclusionReason);
  const mostRecent = validSegments.length > 0 ? validSegments[validSegments.length - 1] : null;

  return {
    hasEnoughData: true,
    overallAverageMpg: Math.round(overall * 10) / 10,
    mostRecentFillUpMpg: mostRecent ? Math.round(mostRecent.mpg * 10) / 10 : undefined,
    trend: mostRecent && mostRecent.mpg > overall ? "recent fill-ups above average" : mostRecent && mostRecent.mpg < overall ? "recent fill-ups below average" : "steady",
  };
}

// ---- All reminders, not just the ones needing attention ----
//
// Deliberately returns every reminder, not just overdue/due-soon. A
// question like "when is my next MOT due" is asking about a reminder
// that's neither overdue nor due soon - it's the normal, common case
// for anything scheduled comfortably in the future - and a tool scoped
// to only "what needs attention" structurally cannot answer that,
// regardless of how many times it's called. Filtering here isn't a
// convenience, it's a correctness bug: it makes the assistant confidently
// report an honestly incomplete result as if it were the whole picture.

export async function toolGetReminders(email: string) {
  const bike = await getPrimaryBike(email);
  if (!bike) return { error: "No bike found on this account." };

  const reminders = await getReminders(email, bike.id);
  const withStatus = reminders.map((r) => ({
    name: r.name,
    status: computeReminderStatus(r, bike.currentMileage),
    detail: reminderDetailLabel(r),
  }));

  return {
    overdue: withStatus.filter((r) => r.status === "overdue"),
    dueSoon: withStatus.filter((r) => r.status === "due-soon"),
    upcoming: withStatus.filter((r) => r.status === "ok"),
  };
}

// ---- Annual budget progress ----

export async function toolGetBudgetProgress(email: string) {
  const bike = await getPrimaryBike(email);
  if (!bike) return { error: "No bike found on this account." };
  if (!bike.annualBudget) return { hasBudget: false };

  const year = new Date().getFullYear();
  const [records, mods, fuelLogs, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
    getBills(email, bike.id),
  ]);
  const inYear = (d: string) => new Date(d).getFullYear() === year;
  const sum = (arr: CostItem[]) => arr.filter((x) => inYear(x.date)).reduce((s, x) => s + x.cost, 0);
  const spent = round2(sum(records) + sum(mods) + sum(fuelLogs) + sum(bills));

  return { hasBudget: true, budget: bike.annualBudget, spentThisYear: spent, remaining: round2(bike.annualBudget - spent), year };
}

// ---- When a specific type of job was last logged ----

export interface LastJobArgs {
  jobQuery: string;
}

// Takes the raw, unchecked args - jobQuery is declared "required" in the
// tool schema, but that's a hint to the model, not a runtime guarantee.
// Trusting it without checking is exactly the kind of assumption that
// caused the build to correctly fail here - see the case below.
export async function toolGetLastLoggedJob(email: string, args: Record<string, unknown>) {
  if (typeof args.jobQuery !== "string" || !args.jobQuery.trim()) {
    return { error: "No job type specified." };
  }

  const bike = await getPrimaryBike(email);
  if (!bike) return { error: "No bike found on this account." };

  const records = await getServiceRecords(email, bike.id);
  if (records.length === 0) return { found: false };

  // Simple substring match against the job's label and its raw type
  // key - good enough for "when did I last change my oil" without
  // needing a second AI pass just to resolve a job name.
  const q = args.jobQuery.toLowerCase();
  const matches = records.filter((r) => {
    const label = (JOB_LABELS[r.jobType] ?? r.jobType ?? "").toLowerCase();
    return label.includes(q) || q.includes(label) || (r.jobType ?? "").toLowerCase().includes(q);
  });
  if (matches.length === 0) return { found: false };

  matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = matches[0];
  return { found: true, date: latest.date, mileage: latest.mileage, cost: latest.cost, jobType: JOB_LABELS[latest.jobType] ?? latest.jobType };
}

// ---- Gemini function-calling schema for every tool above ----
// Kept in the same file as the implementations so the two can never
// drift apart - a tool declared here without a matching case in the
// route's dispatch switch would fail loudly at request time, not
// silently produce a wrong answer.

export const ASSISTANT_TOOL_DECLARATIONS = [
  {
    name: "getSpendTotal",
    description: "Get the signed-in user's own total spend, optionally filtered by category and/or a date range. Use for any 'how much have I spent' question.",
    parameters: {
      type: "OBJECT",
      properties: {
        startDate: { type: "STRING", description: "ISO date (YYYY-MM-DD), inclusive. Omit for no lower bound." },
        endDate: { type: "STRING", description: "ISO date (YYYY-MM-DD), inclusive. Omit for no upper bound." },
        category: { type: "STRING", enum: ["servicing", "fuel", "mods", "bills"], description: "Omit to total across every category." },
      },
    },
  },
  {
    name: "getMileage",
    description: "Get the signed-in user's current mileage, or the closest logged mileage to a given date.",
    parameters: {
      type: "OBJECT",
      properties: {
        atDate: { type: "STRING", description: "ISO date (YYYY-MM-DD). Omit for current mileage." },
      },
    },
  },
  {
    name: "getMpgTrend",
    description: "Get the signed-in user's actual fuel economy (not the manufacturer figure) and whether recent fill-ups are trending above or below their own average.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getReminders",
    description: "Get all of the signed-in user's reminders and their status - overdue, due soon, and upcoming/on-track - including when each is due. Use this for any question about a reminder, including 'when is X due' for something that isn't overdue or due soon yet.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getBudgetProgress",
    description: "Get the signed-in user's annual budget and how much of it they've spent this year, if they've set one.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getLastLoggedJob",
    description: "Find when the signed-in user last logged a specific type of service job, e.g. an oil change or tyre replacement.",
    parameters: {
      type: "OBJECT",
      properties: {
        jobQuery: { type: "STRING", description: "The job type being asked about, e.g. 'oil change', 'tyres'." },
      },
      required: ["jobQuery"],
    },
  },
] as const;

export type ToolName = (typeof ASSISTANT_TOOL_DECLARATIONS)[number]["name"];

// Single dispatch point - the API route calls this instead of a
// hand-written switch of its own, so the set of callable tools is
// defined in exactly one place.
export async function runAssistantTool(name: string, args: Record<string, unknown>, email: string) {
  switch (name as ToolName) {
    case "getSpendTotal":
      return toolGetSpendTotal(email, args as SpendTotalArgs);
    case "getMileage":
      return toolGetMileage(email, args as MileageArgs);
    case "getMpgTrend":
      return toolGetMpgTrend(email);
    case "getReminders":
      return toolGetReminders(email);
    case "getBudgetProgress":
      return toolGetBudgetProgress(email);
    case "getLastLoggedJob":
      return toolGetLastLoggedJob(email, args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
