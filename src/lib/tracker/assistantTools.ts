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
//
// Vehicle-kind-aware since Phase 6: each read tool below resolves the
// account's own active vehicle via resolveActiveVehicle() (bike.ts's
// getPrimaryBike() is no longer called directly anywhere here) and
// branches to a bike-shaped or car-shaped fetch, then feeds both into
// one shared, vehicle-agnostic compute helper - exactly the same
// "genuinely generic logic, vehicle-specific data-fetch" split every
// other part of this build already uses (see carSummary.ts,
// carReminderStatus.ts). Two tools stay bike-only for now, each
// failing soft with an honest "not available for cars yet" result
// rather than either guessing at a car equivalent or crashing:
// getShareLinks (no share-link concept exists for cars), getStorySoFar
// (CarDoc has no storyCache field - the AI narrative generator is
// motorcycle-written). proposeLogEntry is bike-only for service/bill/mod/
// fuel (the on-screen draft card, AssistantProposedEntryCard.tsx, is
// deeply bike-shaped for those four - grouped job/mod catalogs, a
// hardcoded /api/tracker/* endpoint, no litres-vs-kWh branching), but IS
// available for a car-active session's Labour category specifically,
// since Labour's own catalog and draft card were built vehicle-kind-aware
// from the start - see the labourCategory/vehicleKind handling below.

import { getServiceRecords } from "./serviceRecord";
import { getMods } from "./mod";
import { getBills } from "./bill";
import { getFuelLogs } from "./fuelLog";
import type { FuelLogDoc } from "./fuelLog";
import { getReminders } from "./reminder";
import { computeReminderStatus, reminderDetailLabel } from "./reminderStatus";
import { computeActualMPG, computeMPGSeries, type MpgCalcInput } from "./mpgCalc";
import { gatherMileagePoints, type MileagePoint } from "./summary";
import { JOB_LABELS } from "./jobTypes";
import { BILL_LABELS } from "./billTypes";
import { MOD_LABELS } from "./modTypes";
import { getShareLinksForUser } from "./shareLink";
import { getPendingReceiptRequestsForOwner } from "./receiptRequest";
import { getSellerReportData } from "./sellerReportData";
import { buildBikeComparison } from "./bikeComparison";
import { buildCostPerMileVerdict } from "./bikeComparisonVerdict";
import type { ComparisonPeriod } from "./bikeComparisonPeriod";
import { resolveActiveVehicle } from "./activeVehicle";
import { getCarServiceRecords } from "./carServiceRecord";
import { getCarMods } from "./carMod";
import { getCarBills } from "./carBill";
import { getCarFuelLogs } from "./carFuelLog";
import { getCarReminders } from "./carReminder";
import { computeCarReminderStatus, carReminderDetailLabel } from "./carReminderStatus";
import { gatherCarMileagePoints } from "./carSummary";
import { CAR_JOB_LABELS } from "./carJobTypes";
import { CAR_BILL_LABELS } from "./carBillTypes";
import { CAR_MOD_LABELS } from "./carModTypes";
import { LABOUR_LABELS } from "./labourTypes";
import { CAR_LABOUR_LABELS } from "./carLabourTypes";

type CostItem = { date: string; cost: number };
// Minimal structural shapes both a bike doc type and its car sister
// satisfy - genuinely identical on every field these tools touch, only
// their nominal `type` literal differs (see carSummary.ts's own comment
// for the same reasoning applied to aggregation instead of lookup).
interface ServiceLike { date: string; jobType: string; notes: string; cost: number; mileage: number; }
interface ModLike { date: string; category: string; name: string; notes: string; cost: number; mileage: number; }
interface BillLike { date: string; billType: string; notes: string; cost: number; }

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

function computeSpendTotal(records: CostItem[], mods: CostItem[], fuelLogs: CostItem[], bills: CostItem[], currency: string, args: SpendTotalArgs) {
  const sets: Record<string, CostItem[]> = { servicing: records, mods, fuel: fuelLogs, bills };
  const chosen: CostItem[] = args.category ? (sets[args.category] ?? []) : [...records, ...mods, ...fuelLogs, ...bills];
  const filtered = chosen.filter((x) => inRange(x.date, args.startDate, args.endDate));
  return {
    total: round2(filtered.reduce((s, x) => s + x.cost, 0)),
    currency,
    entryCount: filtered.length,
    category: args.category ?? "all",
  };
}

export async function toolGetSpendTotal(email: string, args: SpendTotalArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    const [records, mods, fuelLogs, bills] = await Promise.all([
      getCarServiceRecords(email, car.id),
      getCarMods(email, car.id),
      getCarFuelLogs(email, car.id),
      getCarBills(email, car.id),
    ]);
    return computeSpendTotal(records, mods, fuelLogs, bills, car.currency ?? "GBP", args);
  }

  const bike = vehicle.bike;
  const [records, mods, fuelLogs, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
    getBills(email, bike.id),
  ]);
  return computeSpendTotal(records, mods, fuelLogs, bills, bike.currency ?? "GBP", args);
}

// ---- The individual entries behind a total, not just the number ----
//
// getSpendTotal above answers "how much" - this answers "what was it".
// Requires a date or a range rather than defaulting to the whole
// history: an unscoped call here could return every record ever logged,
// which is both a poor answer to "what did I buy on X" and needlessly
// expensive to hand the model in full.

export interface GetEntriesArgs {
  date?: string;
  startDate?: string;
  endDate?: string;
  category?: "servicing" | "fuel" | "mods" | "bills";
}

interface HistoryEntry {
  date: string;
  category: "service" | "fuel" | "mod" | "bill";
  description: string;
  cost: number;
}

// Notes/name are appended to the category label when present, rather
// than replacing it - "Oil & filter change - done at Halfords" is a
// better answer than either half alone.
function describeWithNotes(label: string, notes?: string): string {
  return notes && notes.trim() ? `${label} - ${notes.trim()}` : label;
}

function describeBikeFuel(f: FuelLogDoc): string {
  return `Fuel fill-up - ${f.litres}L${f.filledToFull ? " (full tank)" : ""}`;
}

function describeCarFuel(f: { litres?: number; kwh?: number; filledToFull?: boolean }): string {
  if (f.kwh != null) return `Charge - ${f.kwh}kWh`;
  return `Fuel fill-up - ${f.litres ?? 0}L${f.filledToFull ? " (full tank)" : ""}`;
}

function computeEntries(
  records: ServiceLike[],
  mods: ModLike[],
  fuelLogs: CostItem[],
  bills: BillLike[],
  currency: string,
  args: GetEntriesArgs,
  labels: { job: Record<string, string>; bill: Record<string, string>; mod: Record<string, string> },
  describeFuel: (f: any) => string
) {
  const start = args.date ?? args.startDate;
  const end = args.date ?? args.endDate;

  const entries: HistoryEntry[] = [];
  if (!args.category || args.category === "servicing") {
    for (const r of records) {
      if (inRange(r.date, start, end)) {
        entries.push({ date: r.date, category: "service", description: describeWithNotes(labels.job[r.jobType] ?? r.jobType, r.notes), cost: r.cost });
      }
    }
  }
  if (!args.category || args.category === "fuel") {
    for (const f of fuelLogs) {
      if (inRange(f.date, start, end)) {
        entries.push({ date: f.date, category: "fuel", description: describeFuel(f), cost: f.cost });
      }
    }
  }
  if (!args.category || args.category === "mods") {
    for (const m of mods) {
      if (inRange(m.date, start, end)) {
        entries.push({ date: m.date, category: "mod", description: describeWithNotes(`${labels.mod[m.category] ?? m.category} - ${m.name}`, m.notes), cost: m.cost });
      }
    }
  }
  if (!args.category || args.category === "bills") {
    for (const b of bills) {
      if (inRange(b.date, start, end)) {
        entries.push({ date: b.date, category: "bill", description: describeWithNotes(labels.bill[b.billType] ?? b.billType, b.notes), cost: b.cost });
      }
    }
  }

  entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    entries,
    entryCount: entries.length,
    totalCost: round2(entries.reduce((s, e) => s + e.cost, 0)),
    currency,
    ...(entries.length === 0 ? { note: "Nothing logged in that range." } : {}),
  };
}

export async function toolGetEntries(email: string, args: GetEntriesArgs) {
  if (!args.date && !args.startDate && !args.endDate) {
    return { error: "Needs a date, or a start/end range, to look up - which day, or which period?" };
  }

  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    const [records, mods, fuelLogs, bills] = await Promise.all([
      getCarServiceRecords(email, car.id),
      getCarMods(email, car.id),
      getCarFuelLogs(email, car.id),
      getCarBills(email, car.id),
    ]);
    return computeEntries(records, mods, fuelLogs, bills, car.currency ?? "GBP", args, { job: CAR_JOB_LABELS, bill: CAR_BILL_LABELS, mod: CAR_MOD_LABELS }, describeCarFuel);
  }

  const bike = vehicle.bike;
  const [records, mods, fuelLogs, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
    getBills(email, bike.id),
  ]);
  return computeEntries(records, mods, fuelLogs, bills, bike.currency ?? "GBP", args, { job: JOB_LABELS, bill: BILL_LABELS, mod: MOD_LABELS }, describeBikeFuel);
}

// ---- Current mileage, or the closest logged mileage to a given date ----

export interface MileageArgs {
  atDate?: string;
}

function closestMileagePoint(points: MileagePoint[], atDate: string) {
  if (points.length === 0) return { error: "No mileage history logged yet." };

  // Closest logged point to the requested date, not an interpolation -
  // an approximate but honestly-labelled answer, never a fabricated
  // exact figure for a date nothing was actually logged on.
  const target = new Date(atDate).getTime();
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

export async function toolGetMileage(email: string, args: MileageArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    if (!args.atDate) return { mileage: car.currentMileage, asOf: "current" };
    const [records, mods, fuelLogs] = await Promise.all([
      getCarServiceRecords(email, car.id),
      getCarMods(email, car.id),
      getCarFuelLogs(email, car.id),
    ]);
    return closestMileagePoint(gatherCarMileagePoints(records, mods, fuelLogs), args.atDate);
  }

  const bike = vehicle.bike;
  if (!args.atDate) return { mileage: bike.currentMileage, asOf: "current" };
  const [records, mods, fuelLogs] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
  ]);
  return closestMileagePoint(gatherMileagePoints(records, mods, fuelLogs), args.atDate);
}

// ---- Actual fuel economy and its recent trend ----

function computeMpgTrendResult(fuelLogs: MpgCalcInput[], officialMpg?: number) {
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

export async function toolGetMpgTrend(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    // MPG is meaningless for an electric car - a kWh-per-mile equivalent
    // would need its own outlier-detection pass (mpgCalc.ts's is
    // genuinely tuned for litres/MPG), not attempted here.
    if (car.fuelType === "electric") {
      return { hasEnoughData: false, reason: "This car is electric - MPG doesn't apply, and a miles-per-kWh figure isn't tracked yet." };
    }
    const fuelLogs = await getCarFuelLogs(email, car.id);
    const withLitres: MpgCalcInput[] = fuelLogs
      .filter((f) => f.litres != null)
      .map((f) => ({
        id: f.id,
        mileage: f.mileage,
        litres: f.litres as number,
        filledToFull: f.filledToFull === true,
        date: f.date,
        mileageAnomaly: f.mileageAnomaly,
      }));
    return computeMpgTrendResult(withLitres, car.dvlaData?.officialCombinedMpg);
  }

  const bike = vehicle.bike;
  const fuelLogs = await getFuelLogs(email, bike.id);
  return computeMpgTrendResult(fuelLogs, bike.dvlaData?.officialCombinedMpg);
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

function groupReminders(withStatus: { name: string; status: "ok" | "due-soon" | "overdue"; detail: string }[]) {
  return {
    overdue: withStatus.filter((r) => r.status === "overdue"),
    dueSoon: withStatus.filter((r) => r.status === "due-soon"),
    upcoming: withStatus.filter((r) => r.status === "ok"),
  };
}

export async function toolGetReminders(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    const reminders = await getCarReminders(email, car.id);
    return groupReminders(reminders.map((r) => ({ name: r.name, status: computeCarReminderStatus(r, car.currentMileage), detail: carReminderDetailLabel(r) })));
  }

  const bike = vehicle.bike;
  const reminders = await getReminders(email, bike.id);
  return groupReminders(reminders.map((r) => ({ name: r.name, status: computeReminderStatus(r, bike.currentMileage), detail: reminderDetailLabel(r) })));
}

// ---- Annual budget progress ----

function computeBudgetProgress(budget: number, records: CostItem[], mods: CostItem[], fuelLogs: CostItem[], bills: CostItem[], year: number) {
  const inYear = (d: string) => new Date(d).getFullYear() === year;
  const sum = (arr: CostItem[]) => arr.filter((x) => inYear(x.date)).reduce((s, x) => s + x.cost, 0);
  const spent = round2(sum(records) + sum(mods) + sum(fuelLogs) + sum(bills));
  return { hasBudget: true, budget, spentThisYear: spent, remaining: round2(budget - spent), year };
}

export async function toolGetBudgetProgress(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };
  const year = new Date().getFullYear();

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    if (!car.annualBudget) return { hasBudget: false };
    const [records, mods, fuelLogs, bills] = await Promise.all([
      getCarServiceRecords(email, car.id),
      getCarMods(email, car.id),
      getCarFuelLogs(email, car.id),
      getCarBills(email, car.id),
    ]);
    return computeBudgetProgress(car.annualBudget, records, mods, fuelLogs, bills, year);
  }

  const bike = vehicle.bike;
  if (!bike.annualBudget) return { hasBudget: false };
  const [records, mods, fuelLogs, bills] = await Promise.all([
    getServiceRecords(email, bike.id),
    getMods(email, bike.id),
    getFuelLogs(email, bike.id),
    getBills(email, bike.id),
  ]);
  return computeBudgetProgress(bike.annualBudget, records, mods, fuelLogs, bills, year);
}

// ---- When a specific type of job was last logged ----

export interface LastJobArgs {
  jobQuery: string;
}

function findLastLoggedJob(records: ServiceLike[], jobQuery: string, jobLabels: Record<string, string>) {
  if (records.length === 0) return { found: false };

  // Simple substring match against the job's label and its raw type
  // key - good enough for "when did I last change my oil" without
  // needing a second AI pass just to resolve a job name.
  const q = jobQuery.toLowerCase();
  const matches = records.filter((r) => {
    const label = (jobLabels[r.jobType] ?? r.jobType ?? "").toLowerCase();
    return label.includes(q) || q.includes(label) || (r.jobType ?? "").toLowerCase().includes(q);
  });
  if (matches.length === 0) return { found: false };

  matches.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const latest = matches[0];
  return { found: true, date: latest.date, mileage: latest.mileage, cost: latest.cost, jobType: jobLabels[latest.jobType] ?? latest.jobType };
}

// Takes the raw, unchecked args - jobQuery is declared "required" in the
// tool schema, but that's a hint to the model, not a runtime guarantee.
// Trusting it without checking is exactly the kind of assumption that
// caused the build to correctly fail here - see the case below.
export async function toolGetLastLoggedJob(email: string, args: Record<string, unknown>) {
  if (typeof args.jobQuery !== "string" || !args.jobQuery.trim()) {
    return { error: "No job type specified." };
  }

  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const records = await getCarServiceRecords(email, vehicle.car.id);
    return findLastLoggedJob(records, args.jobQuery, CAR_JOB_LABELS);
  }

  const records = await getServiceRecords(email, vehicle.bike.id);
  return findLastLoggedJob(records, args.jobQuery, JOB_LABELS);
}

// ---- Share links - whether any are active, and any pending receipt requests ----
//
// Same email-only scoping as every tool above: getShareLinksForUser and
// getPendingReceiptRequestsForOwner both take the session's own email,
// nothing model-supplied. Filtered down to the primary bike specifically
// (rather than returning every link across every bike on the account),
// matching how every other tool here answers about "this account's
// bike" singular, not the account in general. No car equivalent exists
// yet (see the ADR's out-of-scope list) - a car-active session gets an
// honest "not available" result rather than either an error or a
// silently-wrong bike-scoped answer.

export async function toolGetShareLinks(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    return { hasActiveLinks: false, pendingReceiptRequestCount: 0, note: "Shareable report links aren't available for cars yet." };
  }

  const bike = vehicle.bike;
  const [allLinks, pendingRequests] = await Promise.all([
    getShareLinksForUser(email),
    getPendingReceiptRequestsForOwner(email),
  ]);

  const now = Date.now();
  const activeLinks = allLinks.filter((l) => l.bikeId === bike.id && (!l.expiresAt || new Date(l.expiresAt).getTime() > now));
  const pendingForBike = pendingRequests.filter((r) => r.bikeId === bike.id);

  if (activeLinks.length === 0) {
    return { hasActiveLinks: false, pendingReceiptRequestCount: pendingForBike.length };
  }

  return {
    hasActiveLinks: true,
    activeLinkCount: activeLinks.length,
    links: activeLinks.map((l) => ({
      sharedWith: l.recipientEmail ?? "not recorded (created before this was required)",
      askingPrice: l.askingPrice ?? null,
      createdAt: l.createdAt,
      expiresAt: l.expiresAt ?? "never expires",
    })),
    pendingReceiptRequestCount: pendingForBike.length,
  };
}

// ---- The Story So Far - the cached AI narrative, if one's been generated ----
//
// Reads bike.storyCache directly off the already-fetched bike document -
// no extra query needed, same document every other tool here already
// loads via resolveActiveVehicle. Deliberately doesn't trigger a fresh
// generation if none exists yet (that's a paid-in-AI-calls action with
// its own weekly cooldown, gated behind an explicit button click on the
// Story So Far tab - a chat question should never silently spend it).
// No car equivalent - CarDoc has no storyCache field at all
// (storyFacts.ts/storyProse.ts are motorcycle-written, see the ADR).

export async function toolGetStorySoFar(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    return { hasStory: false, note: "The Story So Far feature isn't available for cars yet." };
  }

  const bike = vehicle.bike;
  if (!bike.storyCache) {
    return {
      hasStory: false,
      note: "No Story So Far has been generated yet for this bike - the owner needs to visit the Story So Far tab and click Generate my story.",
    };
  }

  const { generatedAt, response } = bike.storyCache;
  return {
    hasStory: true,
    generatedAt,
    documentationVerdict: response.verdict.label,
    verdictReasons: response.verdict.reasons,
    story: response.sharedStory,
    ownerOnlyNotes: response.ownerNotes,
  };
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
    name: "getEntries",
    description: "List the signed-in user's individual logged entries (service, fuel, mods, bills) for a specific date or date range - what each one actually was, its category, and its cost, not just a total. Use this for 'what did I buy/log on X', 'what were those entries', 'what did I spend that amount on', or any question asking for the itemized detail behind a total rather than the total itself. Always requires a date or a range.",
    parameters: {
      type: "OBJECT",
      properties: {
        date: { type: "STRING", description: "ISO date (YYYY-MM-DD) to look up a single day. Use this for a specific-day question." },
        startDate: { type: "STRING", description: "ISO date (YYYY-MM-DD), inclusive. Use with endDate instead of date for a range." },
        endDate: { type: "STRING", description: "ISO date (YYYY-MM-DD), inclusive." },
        category: { type: "STRING", enum: ["servicing", "fuel", "mods", "bills"], description: "Omit to include every category." },
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
    description: "Get the signed-in user's actual fuel economy (not the manufacturer figure) and whether recent fill-ups are trending above or below their own average. Not applicable for an electric vehicle.",
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
  {
    name: "getShareLinks",
    description: "Get the signed-in user's own active shareable report links for their bike - who each was shared with, any asking price set, when it expires, and how many pending receipt requests are waiting on a decision. Use for any question about their share link(s), whether they've shared their bike, or receipt requests from a buyer. Not available for a car-active account yet.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getStorySoFar",
    description: "Get the signed-in user's own cached 'Story So Far' - the AI-written narrative about their bike's logged history, its documentation verdict, and the private owner-only notes. Use for any question about their Story So Far, what it says, or whether one has been generated yet. Not available for a car-active account yet.",
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

export type ToolName = (typeof ASSISTANT_TOOL_DECLARATIONS)[number]["name"];

// ---- The specific shared report currently open, if any ----
//
// Deliberately NOT part of ASSISTANT_TOOL_DECLARATIONS above and NOT
// gated on a session at all - a signed-out buyer with a valid,
// already-unlocked report link must be able to use this. The token
// this reads is never model-supplied (same principle as email for the
// tools above): route.ts only offers this declaration once it has
// independently verified, server-side, that the token resolves to a
// real report AND that this same browser already passed that report's
// plate-gate (hasReportAccess) - the exact same check the report pages
// themselves use to decide whether to render at all. So this tool can
// never surface anything the visitor couldn't already read directly
// off the page in front of them.
export const REPORT_TOOL_DECLARATIONS = [
  {
    name: "getViewedReport",
    description: "Get a summary of the specific shared report currently open on this page - the documentation verdict, evidence quality, the story the record tells, upcoming costs, and (if available) the dealer-style honest read with strengths and things worth asking about. Use this for any question about 'this report', 'this bike' when a report page is open, or a request to summarize what's shown. This report may belong to a completely different account than whoever is signed in, if anyone - never answer a question about it using the signed-in user's own personal-data tools, and never use this tool to answer a question about the signed-in user's own account.",
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

export async function toolGetViewedReport(shareToken: string) {
  try {
    const data = await getSellerReportData(shareToken);
    const bike = data.bike;
    const honestRead = bike.buyerOpinionCache?.response ?? null;

    return {
      bike: `${bike.isCustomBuild ? "Custom build" : bike.year ?? ""} ${bike.make} ${bike.model}`.trim(),
      currentMileage: bike.currentMileage,
      askingPrice: data.askingPrice ?? null,
      documentationVerdict: data.verdict.label,
      verdictReasons: data.verdict.reasons,
      recordSummary: data.storyParagraphs,
      evidenceQuality: {
        totalRecords: data.evidenceQuality.totalRecords,
        receiptCoveragePct: data.evidenceQuality.receiptCoveragePct,
        realTimePct: data.evidenceQuality.realTimePct,
        mileageInternallyConsistent: data.evidenceQuality.mileageInternallyConsistent,
      },
      upcomingCosts: data.upcomingCostItems.map((i) => ({ label: i.label, timing: i.timing, timingDetail: i.timingDetail })),
      // Only present if already generated and cached - never triggers a
      // fresh AI generation from a chat question, same reasoning as
      // toolGetStorySoFar above.
      ...(honestRead ? { honestRead: honestRead.honestRead, strengths: honestRead.strengths, concerns: honestRead.concerns } : {}),
    };
  } catch (err) {
    // Covers a token that stops resolving between route.ts's check and
    // this call (e.g. deleted or expired in that gap) - fail as a plain
    // tool error the model can relay honestly, never an unhandled throw.
    console.error("toolGetViewedReport failed:", err);
    return { error: "Couldn't load this report right now." };
  }
}

// ---- The specific bike comparison currently open, if any ----
//
// Deliberately its own separate declaration, same reasoning as
// REPORT_TOOL_DECLARATIONS above - this needs its own extra gate beyond
// plain "is signed in" (Pro, and every bike genuinely belongs to this
// account and isn't read-only), evaluated once by route.ts before this
// is ever offered to the model. bikeIds/from/to here are never
// model-supplied - they're the server-validated CompareContext route.ts
// built from the client's OWN current page state, cross-checked against
// this session's real bikes, exactly like reportToken above. Bike-only:
// the garage comparison page has no car equivalent (see the ADR's
// out-of-scope list).
export interface CompareContext {
  bikeIds: string[];
  from?: string;
  to?: string;
}

export const COMPARISON_TOOL_DECLARATIONS = [
  {
    name: "getViewedComparison",
    description: "Get a summary of the bike comparison currently open on the Compare bikes page - cost per mile for each bike (and which one is cheapest to run), total spend, mileage ridden, actual fuel economy, servicing history, documentation completeness, and what's due soonest on each. Use this for any question about 'this comparison', 'these bikes', 'which one', 'which is cheaper', or a vague question asked while this page is open. Never use the signed-in user's other personal-data tools to answer a question about this specific comparison, and never use this tool to answer a general question about their account outside of it.",
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

export async function toolGetViewedComparison(email: string, compareContext: CompareContext) {
  try {
    const period: ComparisonPeriod | undefined =
      compareContext.from || compareContext.to ? { from: compareContext.from, to: compareContext.to } : undefined;
    const entries = await buildBikeComparison(email, compareContext.bikeIds, period);
    if (entries.length < 2) return { error: "Couldn't load this comparison right now." };

    const verdict = buildCostPerMileVerdict(entries.map((e) => ({ bikeId: e.bikeId, name: e.name, costPerMile: e.costPerMile })));

    return {
      period: period ? { from: period.from ?? null, to: period.to ?? null } : "overall",
      // Computed here, not left for the model to work out from the raw
      // numbers below - a plain sentence the model can relay verbatim is
      // far less likely to be wrong than the model doing its own "which
      // is cheaper" arithmetic across several bikes' figures.
      cheapestToRunVerdict: verdict,
      bikes: entries.map((e) => ({
        name: e.name,
        costPerMile: e.costPerMile,
        totalSpend: e.spend.grandTotal,
        milesRidden: e.milesRidden,
        actualMpg: e.actualMpg,
        servicesLogged: e.serviceCount,
        documentationCoveragePct: e.documentationPct,
        dueSoonest: e.nextDue,
      })),
    };
  } catch (err) {
    console.error("toolGetViewedComparison failed:", err);
    return { error: "Couldn't load this comparison right now." };
  }
}

// ---- Draft a new service record, bill, mod/accessory, or fuel log from a description - Pro only ----
//
// Deliberately still read-only in the sense that matters: this never
// writes to Cosmos. It validates and cleans up the model's guess and
// hands back a draft for the widget to show as an editable, on-screen
// confirmation card - committing it is a separate, ordinary POST to the
// exact same /api/tracker/services, /api/tracker/bills,
// /api/tracker/mods, or /api/tracker/fuel endpoint the manual forms
// already use, triggered by the user's own click, never by this tool or
// the model.
//
// Bike-only for now (see the top-of-file comment) - a car-active session
// gets an honest "not available" tool error rather than a draft the
// on-screen card (AssistantProposedEntryCard.tsx) can't actually post
// anywhere correctly yet.
//
// Mods have 250+ category keys - far too many to enumerate as a Gemini
// enum without bloating the schema - so modCategory is free text here,
// resolved with the same "case-insensitive substring match, always
// falls back rather than blocking" approach toolGetLastLoggedJob already
// uses for job types, landing on the catalog's own "other-accessory"
// key when nothing matches. Bills have no such fallback key, so an
// unresolvable billType still asks a clarifying question instead of
// guessing - that asymmetry is deliberate, not an oversight.
export interface ProposeLogEntryArgs {
  category?: string;
  description?: string;
  cost?: number;
  date?: string;
  jobType?: string;
  billType?: string;
  modCategory?: string;
  litres?: number;
  filledToFull?: boolean;
  labourCategory?: string;
}

export type ProposedEntry =
  | { category: "service"; jobType: string; jobLabel: string; description: string; cost: number; date: string; mileage: number }
  | { category: "bill"; billType: string; billLabel: string; description: string; cost: number; date: string }
  | { category: "mod"; modCategory: string; modLabel: string; description: string; cost: number; date: string; mileage: number }
  | { category: "fuel"; litres: number; cost: number; date: string; mileage: number; filledToFull: boolean }
  // The only variant that can come from a car-active session (see the
  // top-of-file comment) - vehicleKind is carried on the entry itself,
  // not inferred later, so the draft card and its confirm handler know
  // which catalog and which /api/tracker vs /api/cars endpoint to use
  // without re-resolving the account's active vehicle a second time.
  | { category: "labour"; labourCategory: string; labourLabel: string; description: string; cost: number; date: string; mileage: number; vehicleKind: "bike" | "car" };

function resolveModCategory(input: string | undefined): string {
  const fallback = "other-accessory";
  if (typeof input !== "string" || !input.trim()) return fallback;
  const q = input.trim().toLowerCase();
  if (q in MOD_LABELS) return q;

  const exact = Object.entries(MOD_LABELS).find(([, label]) => label.toLowerCase() === q);
  if (exact) return exact[0];

  const substring = Object.entries(MOD_LABELS).find(([, label]) => {
    const l = label.toLowerCase();
    return l.includes(q) || q.includes(l);
  });
  return substring ? substring[0] : fallback;
}

// Same case-insensitive "exact match, then substring, then a safe
// fallback" approach as resolveModCategory above, generalised over
// whichever labour catalog (bike or car) applies to this session - both
// LABOUR_LABELS and CAR_LABOUR_LABELS carry their own "other" key as the
// fallback, so this never needs a hardcoded default of its own.
function resolveLabourCategory(input: string | undefined, labels: Record<string, string>): string {
  const fallback = "other";
  if (typeof input !== "string" || !input.trim()) return fallback;
  const q = input.trim().toLowerCase();
  if (q in labels) return q;

  const exact = Object.entries(labels).find(([, label]) => label.toLowerCase() === q);
  if (exact) return exact[0];

  const substring = Object.entries(labels).find(([, label]) => {
    const l = label.toLowerCase();
    return l.includes(q) || q.includes(l);
  });
  return substring ? substring[0] : fallback;
}

export async function toolProposeLogEntry(email: string, args: ProposeLogEntryArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    // Labour is the one category the car-active draft card actually
    // supports (see the top-of-file comment) - everything else still
    // gets the honest "not available" reply, now naming the category it
    // was asked for rather than a blanket refusal.
    if (args.category !== "labour") {
      return { error: "Drafting a new entry from chat is only available for Labour on a car-active account right now - log other categories directly from the dashboard instead." };
    }
    const car = vehicle.car;
    if (typeof args.cost !== "number" || !Number.isFinite(args.cost) || args.cost <= 0) {
      return { error: "Needs a valid, positive cost." };
    }
    const parsedCarDate = typeof args.date === "string" ? new Date(args.date) : null;
    const carDate = parsedCarDate && !Number.isNaN(parsedCarDate.getTime()) ? args.date! : new Date().toISOString().slice(0, 10);
    if (new Date(carDate).getTime() > Date.now() + 86_400_000) {
      return { error: "That date is in the future - this can only log something that's already happened." };
    }
    if (typeof args.description !== "string" || !args.description.trim()) {
      return { error: "Needs a short description of what this is." };
    }
    const carLabourCategory = resolveLabourCategory(args.labourCategory, CAR_LABOUR_LABELS);
    const entry: ProposedEntry = {
      category: "labour",
      labourCategory: carLabourCategory,
      labourLabel: CAR_LABOUR_LABELS[carLabourCategory],
      description: args.description.trim(),
      cost: args.cost,
      date: carDate,
      mileage: car.currentMileage,
      vehicleKind: "car",
    };
    return entry;
  }
  const bike = vehicle.bike;

  if (args.category !== "service" && args.category !== "bill" && args.category !== "mod" && args.category !== "fuel" && args.category !== "labour") {
    return { error: "Not sure what category that is - a service item, a bill (insurance/road tax/MOT/finance), a modification/accessory, a fuel fill-up, or labour/workshop time?" };
  }
  if (typeof args.cost !== "number" || !Number.isFinite(args.cost) || args.cost <= 0) {
    return { error: "Needs a valid, positive cost." };
  }

  const parsedDate = typeof args.date === "string" ? new Date(args.date) : null;
  const date = parsedDate && !Number.isNaN(parsedDate.getTime()) ? args.date! : new Date().toISOString().slice(0, 10);
  if (new Date(date).getTime() > Date.now() + 86_400_000) {
    return { error: "That date is in the future - this can only log something that's already happened." };
  }

  if (args.category === "fuel") {
    if (typeof args.litres !== "number" || !Number.isFinite(args.litres) || args.litres <= 0) {
      return { error: "Needs a valid, positive number of litres." };
    }
    const entry: ProposedEntry = { category: "fuel", litres: args.litres, cost: args.cost, date, mileage: bike.currentMileage, filledToFull: args.filledToFull === true };
    return entry;
  }

  if (typeof args.description !== "string" || !args.description.trim()) {
    return { error: "Needs a short description of what this is." };
  }
  const description = args.description.trim();

  if (args.category === "service") {
    const jobType = typeof args.jobType === "string" && args.jobType in JOB_LABELS ? args.jobType : "other";
    const entry: ProposedEntry = { category: "service", jobType, jobLabel: JOB_LABELS[jobType], description, cost: args.cost, date, mileage: bike.currentMileage };
    return entry;
  }

  if (args.category === "mod") {
    const modCategory = resolveModCategory(args.modCategory);
    const entry: ProposedEntry = { category: "mod", modCategory, modLabel: MOD_LABELS[modCategory], description, cost: args.cost, date, mileage: bike.currentMileage };
    return entry;
  }

  if (args.category === "labour") {
    const labourCategory = resolveLabourCategory(args.labourCategory, LABOUR_LABELS);
    const entry: ProposedEntry = { category: "labour", labourCategory, labourLabel: LABOUR_LABELS[labourCategory], description, cost: args.cost, date, mileage: bike.currentMileage, vehicleKind: "bike" };
    return entry;
  }

  const billType = typeof args.billType === "string" ? args.billType : undefined;
  if (!billType || !(billType in BILL_LABELS)) {
    return { error: "Which of these is this for: insurance, road tax, MOT test, or finance?" };
  }
  const entry: ProposedEntry = { category: "bill", billType, billLabel: BILL_LABELS[billType], description, cost: args.cost, date };
  return entry;
}

// Vehicle-kind-dependent, unlike every other declaration array in this
// file: a car-active session's draft card only ever supports Labour (see
// toolProposeLogEntry above), so its schema offers just that one category
// and the car's own labour catalog - never the bike-only categories or
// LABOUR_LABELS' keys, which would let the model draft something the
// car-active card can't actually post anywhere correct.
export function buildLogEntryToolDeclarations(vehicleKind: "bike" | "car") {
  if (vehicleKind === "car") {
    return [
      {
        name: "proposeLogEntry",
        description:
          "Draft a new Labour entry (workshop time, diagnostic hours) for the signed-in user's car, from their description of what they want to log. This only prepares a draft for the user to review, edit, and confirm themselves on screen - it NEVER saves anything by itself. Doesn't need an exact category match - your best guess is fine, the user can correct it on the draft card. Only Labour is available for a car-active account right now - every other category still needs to be logged directly from the dashboard.",
        parameters: {
          type: "OBJECT",
          properties: {
            category: {
              type: "STRING",
              enum: ["labour"],
              description: "Always 'labour' - the only category available for a car-active account.",
            },
            description: { type: "STRING", description: "A short, plain label for what this is, e.g. 'Cambelt replacement' or '2 hours diagnostic time'." },
            cost: { type: "NUMBER", description: "The amount paid, in GBP, as a plain number." },
            date: { type: "STRING", description: "ISO date (YYYY-MM-DD) this was paid/done. Use today's date if the user didn't say otherwise." },
            labourCategory: {
              type: "STRING",
              description: "Your best guess at what kind of labour job this is, in plain words (e.g. 'brake bleed', 'timing belt', 'EV battery health check'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
            },
          },
          required: ["category", "cost"],
        },
      },
    ] as const;
  }

  return [
    {
      name: "proposeLogEntry",
      description:
        "Draft a new service record, insurance/road-tax/MOT/finance bill, modification/accessory, fuel fill-up, or labour/workshop-time entry for the signed-in user's bike, from their description of what they want to log. This only prepares a draft for the user to review, edit, and confirm themselves on screen - it NEVER saves anything by itself, and never changes or deletes an existing entry. Doesn't need an exact category match - your best guess is fine, the user can correct it on the draft card.",
      parameters: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: ["service", "bill", "mod", "fuel", "labour"],
            description: "'service' for maintenance/consumables/small parts, 'bill' for insurance/road-tax/MOT/finance, 'mod' for a modification or accessory (including general detailing products like wax/polish), 'fuel' for a fuel fill-up, 'labour' for workshop time/labour charges billed separately from parts.",
          },
          description: { type: "STRING", description: "Not used for 'fuel'. A short, plain label for what this is, e.g. 'Valve cleaner' or 'Annual insurance renewal'." },
          cost: { type: "NUMBER", description: "The amount paid, in GBP, as a plain number." },
          date: { type: "STRING", description: "ISO date (YYYY-MM-DD) this was paid/done. Use today's date if the user didn't say otherwise." },
          jobType: {
            type: "STRING",
            enum: Object.keys(JOB_LABELS),
            description: "Only for category 'service' - the closest matching job type, or 'other' if genuinely nothing fits.",
          },
          billType: {
            type: "STRING",
            enum: ["insurance", "road-tax", "mot-test", "finance"],
            description: "Only for category 'bill'.",
          },
          modCategory: {
            type: "STRING",
            description: "Only for category 'mod' - your best guess at what kind of part/accessory this is, in plain words (e.g. 'wax', 'tank pad', 'phone mount'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other accessory' if nothing fits.",
          },
          litres: { type: "NUMBER", description: "Only for category 'fuel' - litres put in, as a plain number." },
          filledToFull: { type: "BOOLEAN", description: "Only for category 'fuel' - true only if they said something like 'filled up' or 'full tank', otherwise omit." },
          labourCategory: {
            type: "STRING",
            description: "Only for category 'labour' - your best guess at what kind of labour job this is, in plain words (e.g. 'brake bleed', 'valve clearance', 'wheel bearing'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
          },
        },
        required: ["category", "cost"],
      },
    },
  ] as const;
}

// Single dispatch point - the API route calls this instead of a
// hand-written switch of its own, so the set of callable tools is
// defined in exactly one place.
export async function runAssistantTool(
  name: string,
  args: Record<string, unknown>,
  email: string,
  reportToken?: string,
  compareContext?: CompareContext
) {
  // Checked before the session-scoped switch below, and independent of
  // it - this tool works with no session at all, as long as route.ts
  // already validated the report token. reportToken here is always the
  // server-checked value from route.ts, never read from `args` (which
  // is model-supplied and therefore untrusted for deciding which report
  // to look up, same reasoning as email above).
  if (name === "getViewedReport") {
    if (!reportToken) return { error: "No report is currently open." };
    return toolGetViewedReport(reportToken);
  }

  // Same pattern as getViewedReport above - compareContext is always
  // route.ts's own validated value, never read from `args`.
  if (name === "getViewedComparison") {
    if (!compareContext) return { error: "No comparison is currently open." };
    return toolGetViewedComparison(email, compareContext);
  }

  // Not part of ASSISTANT_TOOL_DECLARATIONS/ToolName below (which is
  // typed straight off that array) - same reason as the two tools
  // above, kept as its own explicit branch rather than folded into the
  // switch with a lying type cast.
  if (name === "proposeLogEntry") {
    return toolProposeLogEntry(email, args as ProposeLogEntryArgs);
  }

  switch (name as ToolName) {
    case "getSpendTotal":
      return toolGetSpendTotal(email, args as SpendTotalArgs);
    case "getEntries":
      return toolGetEntries(email, args as GetEntriesArgs);
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
    case "getShareLinks":
      return toolGetShareLinks(email);
    case "getStorySoFar":
      return toolGetStorySoFar(email);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
