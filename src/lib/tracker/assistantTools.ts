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
// carReminderStatus.ts). getShareLinks and getStorySoFar are now fully
// car-aware too (both features shipped for cars after this file's
// original bike-only branches were written - CarDoc does have its own
// storyCache, and carShareLink.ts/carReceiptRequest.ts are full mirrors).
// proposeLogEntry is bike-only for bill/mod/fuel (the on-screen draft
// card, AssistantProposedEntryCard.tsx, is deeply bike-shaped for those
// three - grouped mod catalog, a hardcoded /api/tracker/* endpoint, no
// litres-vs-kWh branching), but IS available for a car-active session's
// Service, Labour, Fine, and Toll categories specifically, since those
// four were all built vehicle-kind-aware from the start - see the
// jobType/labourCategory/fineType/tollType/vehicleKind handling below.
// Fines and Tolls carry no mileage at all, unlike every other category -
// the simplest shape here, closer to Bill than to Labour.

import { getServiceRecords } from "./serviceRecord";
import { getMods } from "./mod";
import { getBills } from "./bill";
import { getFuelLogs } from "./fuelLog";
import type { FuelLogDoc } from "./fuelLog";
import type { Attachment } from "./cosmosHelpers";
import { VAULT_CATEGORIES, type VaultDocumentCategory } from "./vaultDocument";
import { getReminders } from "./reminder";
import { computeReminderStatus, reminderDetailLabel } from "./reminderStatus";
import { computeActualMPG, computeMPGSeries, type MpgCalcInput } from "./mpgCalc";
import { gatherMileagePoints, type MileagePoint } from "./summary";
import { JOB_LABELS } from "./jobTypes";
import { BILL_LABELS } from "./billTypes";
import { MOD_LABELS } from "./modTypes";
import { getShareLinksForUser } from "./shareLink";
import { getPendingReceiptRequestsForOwner } from "./receiptRequest";
import { getCarShareLinksForUser } from "./carShareLink";
import { getPendingCarReceiptRequestsForOwner } from "./carReceiptRequest";
import { getSellerReportData } from "./sellerReportData";
import { buildBikeComparison } from "./bikeComparison";
import { buildCarComparison } from "./carComparison";
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
import { getLabour } from "./labour";
import { getCarLabour } from "./carLabour";
import { FINE_LABELS } from "./fineTypes";
import { CAR_FINE_LABELS } from "./carFineTypes";
import { TOLL_LABELS } from "./tollTypes";
import { CAR_TOLL_LABELS } from "./carTollTypes";
import { getFines } from "./fine";
import { getCarFines } from "./carFine";
import { getTolls } from "./toll";
import { getCarTolls } from "./carToll";
import { estimateMileage } from "./mileageEstimate";
import type { Region } from "@/lib/priceData";
import { REGION_LABELS } from "@/lib/priceData";
import type { Currency } from "./currency";
import type { DistanceUnit, FuelEconomyUnit } from "./unitFormat";
import type { ShareLinkDuration } from "./shareLink";

type CostItem = { id: string; date: string; cost: number };
// Minimal structural shapes both a bike doc type and its car sister
// satisfy - genuinely identical on every field these tools touch, only
// their nominal `type` literal differs (see carSummary.ts's own comment
// for the same reasoning applied to aggregation instead of lookup).
interface ServiceLike { id: string; date: string; jobType: string; notes: string; cost: number; mileage: number; }
interface ModLike { id: string; date: string; category: string; name: string; notes: string; cost: number; mileage: number; }
interface BillLike { id: string; date: string; billType: string; notes: string; cost: number; }

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
  // The underlying record's own id - lets a later chat message ("edit
  // that to £50 instead") reference this exact entry via
  // proposeEditEntry, without the model ever having to invent one:
  // it can only ever be a value that came from a real, email-scoped
  // lookup like this one or findLastLoggedJob below.
  id: string;
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
        entries.push({ id: r.id, date: r.date, category: "service", description: describeWithNotes(labels.job[r.jobType] ?? r.jobType, r.notes), cost: r.cost });
      }
    }
  }
  if (!args.category || args.category === "fuel") {
    for (const f of fuelLogs) {
      if (inRange(f.date, start, end)) {
        entries.push({ id: f.id, date: f.date, category: "fuel", description: describeFuel(f), cost: f.cost });
      }
    }
  }
  if (!args.category || args.category === "mods") {
    for (const m of mods) {
      if (inRange(m.date, start, end)) {
        entries.push({ id: m.id, date: m.date, category: "mod", description: describeWithNotes(`${labels.mod[m.category] ?? m.category} - ${m.name}`, m.notes), cost: m.cost });
      }
    }
  }
  if (!args.category || args.category === "bills") {
    for (const b of bills) {
      if (inRange(b.date, start, end)) {
        entries.push({ id: b.id, date: b.date, category: "bill", description: describeWithNotes(labels.bill[b.billType] ?? b.billType, b.notes), cost: b.cost });
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
  return { found: true, id: latest.id, date: latest.date, mileage: latest.mileage, cost: latest.cost, jobType: jobLabels[latest.jobType] ?? latest.jobType };
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
// Same email-only scoping as every tool above: getShareLinksForUser/
// getCarShareLinksForUser and getPendingReceiptRequestsForOwner/
// getPendingCarReceiptRequestsForOwner all take the session's own email,
// nothing model-supplied. Filtered down to the active vehicle
// specifically (rather than returning every link across every vehicle
// on the account), matching how every other tool here answers about
// "this account's vehicle" singular, not the account in general.

export async function toolGetShareLinks(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    const [allLinks, pendingRequests] = await Promise.all([
      getCarShareLinksForUser(email),
      getPendingCarReceiptRequestsForOwner(email),
    ]);

    const now = Date.now();
    const activeLinks = allLinks.filter((l) => l.carId === car.id && (!l.expiresAt || new Date(l.expiresAt).getTime() > now));
    const pendingForCar = pendingRequests.filter((r) => r.carId === car.id);

    if (activeLinks.length === 0) {
      return { hasActiveLinks: false, pendingReceiptRequestCount: pendingForCar.length };
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
      pendingReceiptRequestCount: pendingForCar.length,
    };
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
// Reads bike.storyCache/car.storyCache directly off the already-fetched
// vehicle document - no extra query needed, same document every other
// tool here already loads via resolveActiveVehicle. Deliberately
// doesn't trigger a fresh generation if none exists yet (that's a
// paid-in-AI-calls action with its own weekly cooldown, gated behind an
// explicit button click on the Story So Far tab - a chat question
// should never silently spend it).

export async function toolGetStorySoFar(email: string) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    const car = vehicle.car;
    if (!car.storyCache) {
      return {
        hasStory: false,
        note: "No Story So Far has been generated yet for this car - the owner needs to visit the Story So Far tab and click Generate my story.",
      };
    }
    const { generatedAt, response } = car.storyCache;
    return {
      hasStory: true,
      generatedAt,
      documentationVerdict: response.verdict.label,
      verdictReasons: response.verdict.reasons,
      story: response.sharedStory,
      ownerOnlyNotes: response.ownerNotes,
    };
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
    description: "Get the signed-in user's own active shareable report links for their bike or car - who each was shared with, any asking price set, when it expires, and how many pending receipt requests are waiting on a decision. Use for any question about their share link(s), whether they've shared their vehicle, or receipt requests from a buyer.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "getStorySoFar",
    description: "Get the signed-in user's own cached 'Story So Far' - the AI-written narrative about their bike's or car's logged history, its documentation verdict, and the private owner-only notes. Use for any question about their Story So Far, what it says, or whether one has been generated yet.",
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

// ---- The specific vehicle comparison currently open, if any ----
//
// Deliberately its own separate declaration, same reasoning as
// REPORT_TOOL_DECLARATIONS above - this needs its own extra gate beyond
// plain "is signed in" (Pro, and every vehicle genuinely belongs to this
// account and isn't read-only), evaluated once by route.ts before this
// is ever offered to the model. vehicleIds/bikeIds/carIds/from/to here
// are never model-supplied - they're the server-validated CompareContext
// route.ts built from the client's OWN current page state, cross-checked
// against this session's real bikes AND cars, exactly like reportToken
// above. The garage comparison page mixes both vehicle kinds in one
// picker (see vehicleComparison.ts) - vehicleIds keeps the original
// requested order (so the merged result below lines up with what's on
// screen), while bikeIds/carIds are the same ids already split by kind,
// ready to hand straight to each kind's own comparison builder.
export interface CompareContext {
  vehicleIds: string[];
  bikeIds: string[];
  carIds: string[];
  from?: string;
  to?: string;
}

export const COMPARISON_TOOL_DECLARATIONS = [
  {
    name: "getViewedComparison",
    description: "Get a summary of the vehicle comparison currently open on the Compare vehicles page - cost per mile for each bike or car (and which one is cheapest to run), total spend, mileage ridden, actual fuel economy, servicing history, documentation completeness, and what's due soonest on each. Use this for any question about 'this comparison', 'these vehicles', 'which one', 'which is cheaper', or a vague question asked while this page is open. Never use the signed-in user's other personal-data tools to answer a question about this specific comparison, and never use this tool to answer a general question about their account outside of it.",
    parameters: { type: "OBJECT", properties: {} },
  },
] as const;

export async function toolGetViewedComparison(email: string, compareContext: CompareContext) {
  try {
    const period: ComparisonPeriod | undefined =
      compareContext.from || compareContext.to ? { from: compareContext.from, to: compareContext.to } : undefined;
    const [bikeEntries, carEntries] = await Promise.all([
      buildBikeComparison(email, compareContext.bikeIds, period),
      buildCarComparison(email, compareContext.carIds, period),
    ]);
    // Re-ordered to match vehicleIds (the original on-screen selection
    // order), not "every bike then every car" - same reasoning the
    // garage compare page's own entryById/requestedIds.map pattern uses.
    // bikeEntries has no `kind` of its own (BikeComparisonEntry predates
    // the shared VehicleComparisonEntry shape) - tagged here the same
    // way the compare page itself already does.
    const entryById = new Map([
      ...bikeEntries.map((e) => [e.bikeId, { ...e, kind: "bike" as const }] as const),
      ...carEntries.map((e) => [e.bikeId, e] as const),
    ]);
    const entries = compareContext.vehicleIds.map((id) => entryById.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
    if (entries.length < 2) return { error: "Couldn't load this comparison right now." };

    const verdict = buildCostPerMileVerdict(entries.map((e) => ({ bikeId: e.bikeId, name: e.name, costPerMile: e.costPerMile })));

    return {
      period: period ? { from: period.from ?? null, to: period.to ?? null } : "overall",
      // Computed here, not left for the model to work out from the raw
      // numbers below - a plain sentence the model can relay verbatim is
      // far less likely to be wrong than the model doing its own "which
      // is cheaper" arithmetic across several vehicles' figures.
      cheapestToRunVerdict: verdict,
      vehicles: entries.map((e) => ({
        name: e.name,
        kind: e.kind,
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
  kwh?: number;
  filledToFull?: boolean;
  labourCategory?: string;
  fineType?: string;
  tollType?: string;
}

export type ProposedEntry =
  // Every category can now come from either vehicle kind (see the
  // top-of-file comment) - vehicleKind is carried on the entry itself,
  // not inferred later, so the draft card and its confirm handler know
  // which catalog and which /api/tracker vs /api/cars endpoint to use
  // without re-resolving the account's active vehicle a second time.
  // entryId is only ever set by proposeEditEntry (never by
  // proposeLogEntry) - its presence, not a separate flag, is what tells
  // the draft card this is an edit of something real (PATCH to
  // <endpoint>/<entryId>) rather than a brand-new entry (POST). attachment
  // is set server-side in runAssistantTool below, from whatever file the
  // person attached to this chat turn's own message (already uploaded via
  // the same /api/tracker/upload-attachment endpoint the manual forms
  // use) - never something the model itself supplies or invents.
  | { category: "service"; jobType: string; jobLabel: string; description: string; cost: number; date: string; mileage: number; mileageNote?: string; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment }
  | { category: "bill"; billType: string; billLabel: string; description: string; cost: number; date: string; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment }
  | { category: "mod"; modCategory: string; modLabel: string; description: string; cost: number; date: string; mileage: number; mileageNote?: string; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment }
  // litres for anything with an engine, kwh for an EV charging session -
  // never both, mirroring CarFuelLogDoc's own shape. Bike always uses
  // litres (kwh is always undefined there).
  | { category: "fuel"; litres?: number; kwh?: number; cost: number; date: string; mileage: number; mileageNote?: string; filledToFull: boolean; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment }
  | { category: "labour"; labourCategory: string; labourLabel: string; description: string; cost: number; date: string; mileage: number; mileageNote?: string; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment }
  | { category: "fine"; fineType: string; fineLabel: string; description: string; cost: number; date: string; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment }
  | { category: "toll"; tollType: string; tollLabel: string; description: string; cost: number; date: string; vehicleKind: "bike" | "car"; entryId?: string; attachment?: Attachment };

// Same date-based estimate the manual dashboard forms show via
// useEstimatedMileage.ts (same estimateMileage() maths, just run
// server-side here since there's no client hook to hang it off in a
// chat draft flow) - a chat-drafted entry should be no less informed
// about "what was the mileage that day" than one typed in by hand.
// Today (or later) needs no estimate: the current mileage IS the
// answer, not a guess - same shortcut useEstimatedMileage takes and for
// the same reason (the alternative rounds a same-day entry a mile or
// two under the real current figure via the exact-instant-vs-midnight
// gap, which then trips the mileage-consistency check unnecessarily).
function estimateDraftMileage(
  date: string,
  points: MileagePoint[],
  vehicle: { currentMileage: number; startingMileage: number; dateAdded: string }
): { mileage: number; mileageNote?: string } {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (date >= todayStr) return { mileage: vehicle.currentMileage };

  const result = estimateMileage(date, points, vehicle);
  if (result.requiresManualEntry) {
    return {
      mileage: result.mileage,
      mileageNote:
        result.warning ??
        "Not enough logged history near this date to estimate mileage confidently - please check and enter it yourself.",
    };
  }
  const confidenceNote =
    result.confidence === "interpolated" ? "interpolated between logged records" : "estimated from this vehicle's logged pace";
  return {
    mileage: result.mileage,
    mileageNote: `Mileage ${confidenceNote} for this date${result.warning ? ` - ${result.warning}` : ""} - please check and adjust if needed.`,
  };
}

function resolveModCategory(input: string | undefined, labels: Record<string, string>): string {
  const fallback = "other-accessory";
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

// Same case-insensitive "exact match, then substring, then a safe
// fallback" approach as resolveModCategory above, generalised over
// whichever flat catalog applies - labour, fine, or toll, bike or car.
// Genuinely generic (unlike resolveModCategory, which is mod-specific):
// every one of LABOUR_LABELS/CAR_LABOUR_LABELS/FINE_LABELS/
// CAR_FINE_LABELS/TOLL_LABELS/CAR_TOLL_LABELS carries its own "other" key
// as the fallback, so this never needs a hardcoded default of its own.
function resolveCatalogKey(input: string | undefined, labels: Record<string, string>): string {
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

// Required in every case, same as the manual dashboard forms' own date
// field - the model must either have an explicit date from the user or
// have asked "today?" and had it confirmed, never silently assume it.
// Kept as a shared helper since both the bike and car branches below
// need the exact same check.
function resolveRequiredDraftDate(args: ProposeLogEntryArgs): { date: string } | { error: string } {
  const rawDate = typeof args.date === "string" ? args.date.trim() : "";
  const parsed = rawDate ? new Date(rawDate) : null;
  if (!rawDate || !parsed || Number.isNaN(parsed.getTime())) {
    return { error: "What date did this happen (or get paid)? A specific date, or \"today\" if that's right - needed before I can draft this." };
  }
  if (parsed.getTime() > Date.now() + 86_400_000) {
    return { error: "That date is in the future - this can only log something that's already happened." };
  }
  return { date: rawDate };
}

export async function toolProposeLogEntry(email: string, args: ProposeLogEntryArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (vehicle.kind === "car") {
    if (
      args.category !== "service" &&
      args.category !== "bill" &&
      args.category !== "mod" &&
      args.category !== "fuel" &&
      args.category !== "labour" &&
      args.category !== "fine" &&
      args.category !== "toll"
    ) {
      return { error: "Not sure what category that is - a service item, a bill (insurance/road tax/MOT/finance/ULEZ or CAZ/congestion charge), a modification/accessory, a fuel or charging session, labour/workshop time, a fine, or a toll/parking charge?" };
    }
    const car = vehicle.car;
    if (typeof args.cost !== "number" || !Number.isFinite(args.cost) || args.cost <= 0) {
      return { error: "Needs a valid, positive cost." };
    }
    const resolvedCarDate = resolveRequiredDraftDate(args);
    if ("error" in resolvedCarDate) return resolvedCarDate;
    const { date } = resolvedCarDate;

    // Fuel needs no description (same as the bike branch below) - just
    // litres or kwh, whichever this car's own fuelType actually uses.
    if (args.category === "fuel") {
      const isElectric = car.fuelType === "electric";
      const amount = isElectric ? args.kwh : args.litres;
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        return { error: isElectric ? "Needs a valid, positive number of kWh." : "Needs a valid, positive number of litres." };
      }
      const [records, mods, fuelLogs, bills, labour] = await Promise.all([
        getCarServiceRecords(email, car.id),
        getCarMods(email, car.id),
        getCarFuelLogs(email, car.id),
        getCarBills(email, car.id),
        getCarLabour(email, car.id),
      ]);
      const points = gatherCarMileagePoints(records, mods, fuelLogs, bills, labour);
      const { mileage, mileageNote } = estimateDraftMileage(date, points, car);
      const entry: ProposedEntry = {
        category: "fuel",
        litres: isElectric ? undefined : amount,
        kwh: isElectric ? amount : undefined,
        cost: args.cost,
        date,
        mileage,
        mileageNote,
        filledToFull: !isElectric && args.filledToFull === true,
        vehicleKind: "car",
      };
      return entry;
    }

    if (typeof args.description !== "string" || !args.description.trim()) {
      return { error: "Needs a short description of what this is." };
    }
    const description = args.description.trim();

    // Fines and Tolls carry no mileage at all (unlike Service/Mod/Labour) -
    // a plain draft with no mileage-history fetch needed.
    if (args.category === "fine") {
      const fineType = resolveCatalogKey(args.fineType, CAR_FINE_LABELS);
      const entry: ProposedEntry = { category: "fine", fineType, fineLabel: CAR_FINE_LABELS[fineType], description, cost: args.cost, date, vehicleKind: "car" };
      return entry;
    }
    if (args.category === "toll") {
      const tollType = resolveCatalogKey(args.tollType, CAR_TOLL_LABELS);
      const entry: ProposedEntry = { category: "toll", tollType, tollLabel: CAR_TOLL_LABELS[tollType], description, cost: args.cost, date, vehicleKind: "car" };
      return entry;
    }
    if (args.category === "bill") {
      const carBillType = typeof args.billType === "string" ? args.billType : undefined;
      if (!carBillType || !(carBillType in CAR_BILL_LABELS)) {
        return { error: "Which of these is this for: insurance, road tax, MOT test, finance, ULEZ/CAZ, or Congestion Charge?" };
      }
      const entry: ProposedEntry = { category: "bill", billType: carBillType, billLabel: CAR_BILL_LABELS[carBillType], description, cost: args.cost, date, vehicleKind: "car" };
      return entry;
    }

    const [records, mods, fuelLogs, bills, labour] = await Promise.all([
      getCarServiceRecords(email, car.id),
      getCarMods(email, car.id),
      getCarFuelLogs(email, car.id),
      getCarBills(email, car.id),
      getCarLabour(email, car.id),
    ]);
    const points = gatherCarMileagePoints(records, mods, fuelLogs, bills, labour);
    const { mileage, mileageNote } = estimateDraftMileage(date, points, car);

    if (args.category === "service") {
      const jobType = typeof args.jobType === "string" && args.jobType in CAR_JOB_LABELS ? args.jobType : "other";
      const entry: ProposedEntry = { category: "service", jobType, jobLabel: CAR_JOB_LABELS[jobType], description, cost: args.cost, date, mileage, mileageNote, vehicleKind: "car" };
      return entry;
    }
    if (args.category === "mod") {
      const modCategory = resolveModCategory(args.modCategory, CAR_MOD_LABELS);
      const entry: ProposedEntry = { category: "mod", modCategory, modLabel: CAR_MOD_LABELS[modCategory], description, cost: args.cost, date, mileage, mileageNote, vehicleKind: "car" };
      return entry;
    }

    const carLabourCategory = resolveCatalogKey(args.labourCategory, CAR_LABOUR_LABELS);
    const entry: ProposedEntry = {
      category: "labour",
      labourCategory: carLabourCategory,
      labourLabel: CAR_LABOUR_LABELS[carLabourCategory],
      description,
      cost: args.cost,
      date,
      mileage,
      mileageNote,
      vehicleKind: "car",
    };
    return entry;
  }
  const bike = vehicle.bike;

  if (
    args.category !== "service" &&
    args.category !== "bill" &&
    args.category !== "mod" &&
    args.category !== "fuel" &&
    args.category !== "labour" &&
    args.category !== "fine" &&
    args.category !== "toll"
  ) {
    return { error: "Not sure what category that is - a service item, a bill (insurance/road tax/MOT/finance), a modification/accessory, a fuel fill-up, labour/workshop time, a fine, or a toll/parking charge?" };
  }
  if (typeof args.cost !== "number" || !Number.isFinite(args.cost) || args.cost <= 0) {
    return { error: "Needs a valid, positive cost." };
  }

  const resolvedDate = resolveRequiredDraftDate(args);
  if ("error" in resolvedDate) return resolvedDate;
  const { date } = resolvedDate;

  if (args.category === "fuel") {
    if (typeof args.litres !== "number" || !Number.isFinite(args.litres) || args.litres <= 0) {
      return { error: "Needs a valid, positive number of litres." };
    }
    const [records, mods, fuelLogs, bills, labour] = await Promise.all([
      getServiceRecords(email, bike.id),
      getMods(email, bike.id),
      getFuelLogs(email, bike.id),
      getBills(email, bike.id),
      getLabour(email, bike.id),
    ]);
    const points = gatherMileagePoints(records, mods, fuelLogs, bills, labour);
    const { mileage, mileageNote } = estimateDraftMileage(date, points, bike);
    const entry: ProposedEntry = { category: "fuel", litres: args.litres, cost: args.cost, date, mileage, mileageNote, filledToFull: args.filledToFull === true, vehicleKind: "bike" };
    return entry;
  }

  if (typeof args.description !== "string" || !args.description.trim()) {
    return { error: "Needs a short description of what this is." };
  }
  const description = args.description.trim();

  // Fines and Tolls carry no mileage at all (unlike service/mod/labour
  // below, or fuel above) - the simplest drafts here, closer to Bill's
  // own shape further down than to anything mileage-tracked.
  if (args.category === "fine") {
    const fineType = resolveCatalogKey(args.fineType, FINE_LABELS);
    const entry: ProposedEntry = { category: "fine", fineType, fineLabel: FINE_LABELS[fineType], description, cost: args.cost, date, vehicleKind: "bike" };
    return entry;
  }
  if (args.category === "toll") {
    const tollType = resolveCatalogKey(args.tollType, TOLL_LABELS);
    const entry: ProposedEntry = { category: "toll", tollType, tollLabel: TOLL_LABELS[tollType], description, cost: args.cost, date, vehicleKind: "bike" };
    return entry;
  }

  if (args.category === "service" || args.category === "mod" || args.category === "labour") {
    const [records, mods, fuelLogs, bills, labour] = await Promise.all([
      getServiceRecords(email, bike.id),
      getMods(email, bike.id),
      getFuelLogs(email, bike.id),
      getBills(email, bike.id),
      getLabour(email, bike.id),
    ]);
    const points = gatherMileagePoints(records, mods, fuelLogs, bills, labour);
    const { mileage, mileageNote } = estimateDraftMileage(date, points, bike);

    if (args.category === "service") {
      const jobType = typeof args.jobType === "string" && args.jobType in JOB_LABELS ? args.jobType : "other";
      const entry: ProposedEntry = { category: "service", jobType, jobLabel: JOB_LABELS[jobType], description, cost: args.cost, date, mileage, mileageNote, vehicleKind: "bike" };
      return entry;
    }
    if (args.category === "mod") {
      const modCategory = resolveModCategory(args.modCategory, MOD_LABELS);
      const entry: ProposedEntry = { category: "mod", modCategory, modLabel: MOD_LABELS[modCategory], description, cost: args.cost, date, mileage, mileageNote, vehicleKind: "bike" };
      return entry;
    }
    const labourCategory = resolveCatalogKey(args.labourCategory, LABOUR_LABELS);
    const entry: ProposedEntry = { category: "labour", labourCategory, labourLabel: LABOUR_LABELS[labourCategory], description, cost: args.cost, date, mileage, mileageNote, vehicleKind: "bike" };
    return entry;
  }

  const billType = typeof args.billType === "string" ? args.billType : undefined;
  if (!billType || !(billType in BILL_LABELS)) {
    return { error: "Which of these is this for: insurance, road tax, MOT test, or finance?" };
  }
  const entry: ProposedEntry = { category: "bill", billType, billLabel: BILL_LABELS[billType], description, cost: args.cost, date, vehicleKind: "bike" };
  return entry;
}

// Vehicle-kind-dependent, unlike every other declaration array in this
// file: a car-active session's draft card only supports Service,
// Labour, Fine, and Toll (see toolProposeLogEntry above), so its schema
// offers just those four categories and the car's own job/labour/fine/
// toll catalogs - never the bike-only categories or LABOUR_LABELS' own
// keys, which would let the model draft something the car-active card
// can't actually post anywhere correct.
export function buildLogEntryToolDeclarations(vehicleKind: "bike" | "car") {
  if (vehicleKind === "car") {
    return [
      {
        name: "proposeLogEntry",
        description:
          "Draft a new service record, insurance/road-tax/MOT/finance/ULEZ-CAZ/congestion-charge bill, modification/accessory, fuel or charging session, labour/workshop-time entry, fine, or toll/parking charge for the signed-in user's car, from their description of what they want to log. This only prepares a draft for the user to review, edit, and confirm themselves on screen - it NEVER saves anything by itself, and never changes or deletes an existing entry. Doesn't need an exact category match - your best guess is fine, the user can correct it on the draft card. IMPORTANT: always ask the user what date this happened before calling this tool, unless they've already said (including just 'today') - never assume today's date yourself. Once you have the date, this tool works out a suggested mileage for that day automatically (for every category except 'bill', 'fine', and 'toll', which need no mileage at all); you don't need to ask the user for it.",
        parameters: {
          type: "OBJECT",
          properties: {
            category: {
              type: "STRING",
              enum: ["service", "bill", "mod", "fuel", "labour", "fine", "toll"],
              description: "'service' for maintenance/consumables/small parts (including a valet, detailing, or wash), 'bill' for insurance/road-tax/MOT/finance/ULEZ or CAZ/Congestion Charge, 'mod' for a modification or accessory (including general detailing products like wax/polish), 'fuel' for a fuel fill-up or EV charging session, 'labour' for workshop time/labour charges billed separately from parts, 'fine' for a driving offence or penalty charge, 'toll' for a road/bridge/tunnel charge or parking.",
            },
            description: { type: "STRING", description: "Not used for 'fuel'. A short, plain label for what this is, e.g. 'Cambelt replacement', 'Annual insurance renewal', 'Speeding fine on the M25', or 'Parking near the hospital'." },
            cost: { type: "NUMBER", description: "The amount paid, in GBP, as a plain number." },
            date: {
              type: "STRING",
              description:
                "ISO date (YYYY-MM-DD) this was paid/done. Required - ask the user first if they haven't said, and convert a reply like 'today' or 'last Tuesday' to the actual date yourself.",
            },
            jobType: {
              type: "STRING",
              enum: Object.keys(CAR_JOB_LABELS),
              description: "Only for category 'service' - the closest matching job type, or 'other' if genuinely nothing fits.",
            },
            billType: {
              type: "STRING",
              enum: Object.keys(CAR_BILL_LABELS),
              description: "Only for category 'bill'.",
            },
            modCategory: {
              type: "STRING",
              description: "Only for category 'mod' - your best guess at what kind of part/accessory this is, in plain words (e.g. 'wax', 'roof box', 'dash cam'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other accessory' if nothing fits.",
            },
            litres: { type: "NUMBER", description: "Only for category 'fuel', on a petrol/diesel/hybrid/PHEV car - litres put in, as a plain number." },
            kwh: { type: "NUMBER", description: "Only for category 'fuel', on an electric car - kWh added in a charging session, as a plain number." },
            filledToFull: { type: "BOOLEAN", description: "Only for category 'fuel' on a non-electric car - true only if they said something like 'filled up' or 'full tank', otherwise omit." },
            labourCategory: {
              type: "STRING",
              description: "Only for category 'labour' - your best guess at what kind of labour job this is, in plain words (e.g. 'brake bleed', 'timing belt', 'EV battery health check'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
            },
            fineType: {
              type: "STRING",
              description: "Only for category 'fine' - your best guess at what kind of fine this is, in plain words (e.g. 'speeding', 'parking charge notice', 'bus lane'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
            },
            tollType: {
              type: "STRING",
              description: "Only for category 'toll' - your best guess at which toll/charge/parking this is, in plain words (e.g. 'M6 toll', 'parking', 'Dartford crossing'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
            },
          },
          required: ["category", "cost", "date"],
        },
      },
    ] as const;
  }

  return [
    {
      name: "proposeLogEntry",
      description:
        "Draft a new service record, insurance/road-tax/MOT/finance bill, modification/accessory, fuel fill-up, labour/workshop-time entry, fine, or toll/parking charge for the signed-in user's bike, from their description of what they want to log. This only prepares a draft for the user to review, edit, and confirm themselves on screen - it NEVER saves anything by itself, and never changes or deletes an existing entry. Doesn't need an exact category match - your best guess is fine, the user can correct it on the draft card. IMPORTANT: always ask the user what date this happened before calling this tool, unless they've already said (including just 'today') - never assume today's date yourself. Once you have the date, this tool works out a suggested mileage for that day automatically (for every category except 'bill', 'fine', and 'toll', which need no mileage at all); you don't need to ask the user for it.",
      parameters: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: ["service", "bill", "mod", "fuel", "labour", "fine", "toll"],
            description: "'service' for maintenance/consumables/small parts (including a valet, detailing, or wash), 'bill' for insurance/road-tax/MOT/finance, 'mod' for a modification or accessory (including general detailing products like wax/polish), 'fuel' for a fuel fill-up, 'labour' for workshop time/labour charges billed separately from parts, 'fine' for a driving offence or penalty charge, 'toll' for a road/bridge/tunnel charge or parking.",
          },
          description: { type: "STRING", description: "Not used for 'fuel'. A short, plain label for what this is, e.g. 'Valve cleaner', 'Annual insurance renewal', 'Speeding fine on the A1', or 'Parking near the station'." },
          cost: { type: "NUMBER", description: "The amount paid, in GBP, as a plain number." },
          date: {
            type: "STRING",
            description:
              "ISO date (YYYY-MM-DD) this was paid/done. Required - ask the user first if they haven't said, and convert a reply like 'today' or 'last Tuesday' to the actual date yourself.",
          },
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
          fineType: {
            type: "STRING",
            description: "Only for category 'fine' - your best guess at what kind of fine this is, in plain words (e.g. 'speeding', 'no helmet', 'parking charge notice'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
          },
          tollType: {
            type: "STRING",
            description: "Only for category 'toll' - your best guess at which toll/charge/parking this is, in plain words (e.g. 'M6 toll', 'parking', 'Mersey Gateway'). Doesn't need to be exact - it's matched to the closest real category, or filed as 'Other' if nothing fits.",
          },
        },
        required: ["category", "cost", "date"],
      },
    },
  ] as const;
}

// ---- Account/vehicle settings, drafted then confirmed - never applied
// directly, same "propose, review, click to confirm" pattern as
// proposeLogEntry above. Gated behind the same Premium-only
// logEntryAccess check in route.ts (see buildLogEntryToolDeclarations'
// own gating), since this is exactly the same class of capability: the
// assistant changing something on the account, not just answering
// about it.

const REGIONS: Region[] = ["london-se", "rest-england-wales", "scotland-ni"];
const CURRENCIES: Currency[] = ["GBP", "EUR", "PLN", "CZK", "HUF", "RON", "SEK", "DKK", "BGN"];
const DISTANCE_UNITS: DistanceUnit[] = ["mi", "km"];
const FUEL_ECONOMY_UNITS: FuelEconomyUnit[] = ["mpg", "l100km"];

export interface ProposeSettingsChangeArgs {
  currentMileage?: number;
  region?: string;
  annualBudget?: number;
  currency?: string;
  distanceUnit?: string;
  fuelEconomyUnit?: string;
  includeInsuranceInReport?: boolean;
  includeFinanceInReport?: boolean;
  includeFinesInReport?: boolean;
  includeTollsInReport?: boolean;
  includeCleaningInReport?: boolean;
}

export interface ProposedSettingsChange {
  category: "settings";
  vehicleKind: "bike" | "car";
  currentMileage?: number;
  region?: Region;
  annualBudget?: number;
  currency?: Currency;
  distanceUnit?: DistanceUnit;
  fuelEconomyUnit?: FuelEconomyUnit;
  includeInsuranceInReport?: boolean;
  includeFinanceInReport?: boolean;
  includeFinesInReport?: boolean;
  includeTollsInReport?: boolean;
  includeCleaningInReport?: boolean;
}

export async function toolProposeSettingsChange(email: string, args: ProposeSettingsChangeArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  const change: ProposedSettingsChange = { category: "settings", vehicleKind: vehicle.kind };
  let hasAny = false;

  if (args.currentMileage != null) {
    if (typeof args.currentMileage !== "number" || !Number.isFinite(args.currentMileage) || args.currentMileage < 0) {
      return { error: "Needs a valid, non-negative mileage." };
    }
    change.currentMileage = args.currentMileage;
    hasAny = true;
  }
  if (args.region != null) {
    if (!REGIONS.includes(args.region as Region)) {
      return { error: `Which region: ${REGIONS.map((r) => REGION_LABELS[r]).join(", ")}?` };
    }
    change.region = args.region as Region;
    hasAny = true;
  }
  if (args.annualBudget != null) {
    if (typeof args.annualBudget !== "number" || !Number.isFinite(args.annualBudget) || args.annualBudget <= 0) {
      return { error: "Needs a valid, positive annual budget." };
    }
    change.annualBudget = args.annualBudget;
    hasAny = true;
  }
  if (args.currency != null) {
    if (!CURRENCIES.includes(args.currency as Currency)) {
      return { error: "Which currency should costs be shown in?" };
    }
    change.currency = args.currency as Currency;
    hasAny = true;
  }
  if (args.distanceUnit != null) {
    if (!DISTANCE_UNITS.includes(args.distanceUnit as DistanceUnit)) {
      return { error: "Miles or kilometres?" };
    }
    change.distanceUnit = args.distanceUnit as DistanceUnit;
    hasAny = true;
  }
  if (args.fuelEconomyUnit != null) {
    if (!FUEL_ECONOMY_UNITS.includes(args.fuelEconomyUnit as FuelEconomyUnit)) {
      return { error: "MPG or litres/100km?" };
    }
    change.fuelEconomyUnit = args.fuelEconomyUnit as FuelEconomyUnit;
    hasAny = true;
  }
  if (typeof args.includeInsuranceInReport === "boolean") {
    change.includeInsuranceInReport = args.includeInsuranceInReport;
    hasAny = true;
  }
  if (typeof args.includeFinanceInReport === "boolean") {
    change.includeFinanceInReport = args.includeFinanceInReport;
    hasAny = true;
  }
  if (typeof args.includeFinesInReport === "boolean") {
    change.includeFinesInReport = args.includeFinesInReport;
    hasAny = true;
  }
  if (typeof args.includeTollsInReport === "boolean") {
    change.includeTollsInReport = args.includeTollsInReport;
    hasAny = true;
  }
  if (typeof args.includeCleaningInReport === "boolean") {
    change.includeCleaningInReport = args.includeCleaningInReport;
    hasAny = true;
  }

  if (!hasAny) {
    return { error: "What would you like to change - mileage, region, annual budget, currency, units, or what's shown in your buyer report?" };
  }
  return change;
}

export const SETTINGS_TOOL_DECLARATIONS = [
  {
    name: "proposeSettingsChange",
    description:
      "Draft a change to one or more of the signed-in user's account/vehicle settings - current mileage, region (used for price benchmarks), annual running-cost budget, display currency, distance/fuel-economy units, or which categories (insurance, finance, fines, tolls, valeting/washing) are shown in their buyer-facing report. This only prepares a draft for the user to review and confirm themselves on screen - it NEVER changes anything by itself. Only include the fields the user actually asked to change; leave every other field out entirely, don't guess at ones they didn't mention.",
    parameters: {
      type: "OBJECT",
      properties: {
        currentMileage: { type: "NUMBER", description: "The vehicle's current odometer reading." },
        region: { type: "STRING", enum: REGIONS, description: "Used to adjust price benchmarks to their local area." },
        annualBudget: { type: "NUMBER", description: "Their yearly running-cost budget, in GBP." },
        currency: { type: "STRING", enum: CURRENCIES, description: "Which currency costs are displayed in." },
        distanceUnit: { type: "STRING", enum: DISTANCE_UNITS, description: "Miles or kilometres." },
        fuelEconomyUnit: { type: "STRING", enum: FUEL_ECONOMY_UNITS, description: "MPG or litres per 100km." },
        includeInsuranceInReport: { type: "BOOLEAN", description: "Whether insurance history is shown in their buyer-facing report." },
        includeFinanceInReport: { type: "BOOLEAN", description: "Whether finance history is shown in their buyer-facing report." },
        includeFinesInReport: { type: "BOOLEAN", description: "Whether fines are shown in their buyer-facing report." },
        includeTollsInReport: { type: "BOOLEAN", description: "Whether tolls are shown in their buyer-facing report." },
        includeCleaningInReport: { type: "BOOLEAN", description: "Whether valeting/washing costs are shown in their buyer-facing report." },
      },
      required: [],
    },
  },
] as const;

// ---- Shareable link creation, drafted then confirmed - the recipient
// email always stays editable on the draft card, never silently sent
// to whoever the model thinks was meant, since a share link is what
// actually grants outside access to this vehicle's history.

export interface ProposeShareLinkArgs {
  duration?: string;
  recipientEmail?: string;
  askingPrice?: number;
}

export interface ProposedShareLink {
  category: "shareLink";
  vehicleKind: "bike" | "car";
  duration: ShareLinkDuration;
  recipientEmail: string;
  askingPrice?: number;
}

const SHARE_LINK_DURATIONS: ShareLinkDuration[] = ["1week", "1month", "6months"];

export async function toolProposeShareLink(email: string, args: ProposeShareLinkArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  const duration = typeof args.duration === "string" && SHARE_LINK_DURATIONS.includes(args.duration as ShareLinkDuration)
    ? (args.duration as ShareLinkDuration)
    : "1month";

  if (args.askingPrice != null && (typeof args.askingPrice !== "number" || !Number.isFinite(args.askingPrice) || args.askingPrice <= 0)) {
    return { error: "Needs a valid, positive asking price, or none at all." };
  }

  const change: ProposedShareLink = {
    category: "shareLink",
    vehicleKind: vehicle.kind,
    duration,
    // Never blank on the draft - always something for the user to
    // check or fill in themselves before the real create call, which
    // requires it anyway.
    recipientEmail: typeof args.recipientEmail === "string" ? args.recipientEmail.trim() : "",
    askingPrice: args.askingPrice,
  };
  return change;
}

export const SHARE_LINK_TOOL_DECLARATIONS = [
  {
    name: "proposeShareLink",
    description:
      "Draft a new shareable report link for the signed-in user's vehicle, to send to a prospective buyer. This only prepares a draft for the user to review, edit the recipient email, and confirm themselves on screen - it NEVER creates the link by itself. IMPORTANT: always ask who this is for (their email address) before calling this tool, unless they've already said - never invent or guess an email address.",
    parameters: {
      type: "OBJECT",
      properties: {
        recipientEmail: { type: "STRING", description: "The email address of the person this link is being shared with. Ask if not already given." },
        duration: { type: "STRING", enum: SHARE_LINK_DURATIONS, description: "How long the link stays valid for. Defaults to 1 month if not specified." },
        askingPrice: { type: "NUMBER", description: "Optional - the asking price to show alongside the report, in GBP." },
      },
      required: [],
    },
  },
] as const;

// ---- Editing an existing entry, drafted then confirmed - same
// "propose, review, click to confirm" pattern as everything above, the
// one real difference being that this one's entryId can only ever have
// come from a genuine prior lookup (getEntries/getLastLoggedJob) scoped
// to this same session's own email, never invented by the model. The
// tool re-fetches the real record by that id (through the same
// email-scoped bulk getters those lookups themselves use) before
// building the draft, so an id that doesn't actually belong to this
// account's active vehicle simply isn't found, exactly like every other
// tool here that never trusts a model-supplied identifier for account
// scoping. Every field the model doesn't mention changing keeps the
// record's own current value - this is an edit, not a blank redraft.

export interface ProposeEditEntryArgs {
  category?: string;
  entryId?: string;
  cost?: number;
  date?: string;
  description?: string;
  jobType?: string;
  billType?: string;
  modCategory?: string;
  labourCategory?: string;
  fineType?: string;
  tollType?: string;
  litres?: number;
  kwh?: number;
  filledToFull?: boolean;
  mileage?: number;
}

function resolveOptionalEditDate(rawDate: string | undefined, existingDate: string): { date: string } | { error: string } {
  if (rawDate == null) return { date: existingDate };
  const trimmed = rawDate.trim();
  const parsed = trimmed ? new Date(trimmed) : null;
  if (!trimmed || !parsed || Number.isNaN(parsed.getTime())) {
    return { error: "That doesn't look like a valid date." };
  }
  if (parsed.getTime() > Date.now() + 86_400_000) {
    return { error: "That date is in the future - this can only edit something that's already happened." };
  }
  return { date: trimmed };
}

export async function toolProposeEditEntry(email: string, args: ProposeEditEntryArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  if (
    args.category !== "service" && args.category !== "bill" && args.category !== "mod" &&
    args.category !== "fuel" && args.category !== "labour" && args.category !== "fine" && args.category !== "toll"
  ) {
    return { error: "Not sure what category that entry is - service, bill, mod, fuel, labour, fine, or toll?" };
  }
  if (typeof args.entryId !== "string" || !args.entryId.trim()) {
    return { error: "Which entry? Look it up first - e.g. ask what was logged on a given date - so there's a specific one to edit." };
  }
  const entryId = args.entryId;

  if (args.cost != null && (typeof args.cost !== "number" || !Number.isFinite(args.cost) || args.cost <= 0)) {
    return { error: "Needs a valid, positive cost." };
  }
  if (args.mileage != null && (typeof args.mileage !== "number" || !Number.isFinite(args.mileage) || args.mileage < 0)) {
    return { error: "Needs a valid, non-negative mileage." };
  }

  const isCar = vehicle.kind === "car";
  const vehicleId = isCar ? vehicle.car.id : vehicle.bike.id;
  const jobLabels = isCar ? CAR_JOB_LABELS : JOB_LABELS;
  const billLabels = isCar ? CAR_BILL_LABELS : BILL_LABELS;
  const modLabels = isCar ? CAR_MOD_LABELS : MOD_LABELS;
  const labourLabels = isCar ? CAR_LABOUR_LABELS : LABOUR_LABELS;
  const fineLabels = isCar ? CAR_FINE_LABELS : FINE_LABELS;
  const tollLabels = isCar ? CAR_TOLL_LABELS : TOLL_LABELS;

  if (args.category === "service") {
    const existing = (isCar ? await getCarServiceRecords(email, vehicleId) : await getServiceRecords(email, vehicleId)).find((r) => r.id === entryId);
    if (!existing) return { error: "Couldn't find that service record - it may have been deleted, or check the dashboard directly." };
    const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
    if ("error" in resolvedDate) return resolvedDate;
    const jobType = typeof args.jobType === "string" && args.jobType in jobLabels ? args.jobType : existing.jobType;
    const entry: ProposedEntry = {
      category: "service", jobType, jobLabel: jobLabels[jobType],
      description: typeof args.description === "string" ? args.description : existing.notes,
      cost: args.cost ?? existing.cost, date: resolvedDate.date, mileage: args.mileage ?? existing.mileage,
      vehicleKind: vehicle.kind, entryId,
    };
    return entry;
  }
  if (args.category === "bill") {
    const existing = (isCar ? await getCarBills(email, vehicleId) : await getBills(email, vehicleId)).find((b) => b.id === entryId);
    if (!existing) return { error: "Couldn't find that bill - it may have been deleted, or check the dashboard directly." };
    const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
    if ("error" in resolvedDate) return resolvedDate;
    const billType = typeof args.billType === "string" && args.billType in billLabels ? args.billType : existing.billType;
    const entry: ProposedEntry = {
      category: "bill", billType, billLabel: billLabels[billType],
      description: typeof args.description === "string" ? args.description : existing.notes,
      cost: args.cost ?? existing.cost, date: resolvedDate.date, vehicleKind: vehicle.kind, entryId,
    };
    return entry;
  }
  if (args.category === "mod") {
    const existing = (isCar ? await getCarMods(email, vehicleId) : await getMods(email, vehicleId)).find((m) => m.id === entryId);
    if (!existing) return { error: "Couldn't find that modification/accessory - it may have been deleted, or check the dashboard directly." };
    const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
    if ("error" in resolvedDate) return resolvedDate;
    const modCategory = typeof args.modCategory === "string" && args.modCategory in modLabels ? args.modCategory : existing.category;
    const entry: ProposedEntry = {
      category: "mod", modCategory, modLabel: modLabels[modCategory],
      description: typeof args.description === "string" ? args.description : existing.name,
      cost: args.cost ?? existing.cost, date: resolvedDate.date, mileage: args.mileage ?? existing.mileage,
      vehicleKind: vehicle.kind, entryId,
    };
    return entry;
  }
  if (args.category === "fuel") {
    // Both FuelLogDoc (bike, litres only) and CarFuelLogDoc (litres OR
    // kwh) are structurally compatible with this narrower shape - the
    // only two fields this branch actually reads from either.
    const fuelLogs: { id: string; date: string; cost: number; mileage: number; litres?: number; kwh?: number; filledToFull?: boolean }[] =
      isCar ? await getCarFuelLogs(email, vehicleId) : await getFuelLogs(email, vehicleId);
    const existing = fuelLogs.find((f) => f.id === entryId);
    if (!existing) return { error: "Couldn't find that fuel/charging entry - it may have been deleted, or check the dashboard directly." };
    const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
    if ("error" in resolvedDate) return resolvedDate;
    const wasElectric = existing.kwh != null;
    const entry: ProposedEntry = {
      category: "fuel",
      litres: wasElectric ? undefined : (args.litres ?? existing.litres),
      kwh: wasElectric ? (args.kwh ?? existing.kwh) : undefined,
      cost: args.cost ?? existing.cost, date: resolvedDate.date, mileage: args.mileage ?? existing.mileage,
      filledToFull: wasElectric ? false : (args.filledToFull ?? existing.filledToFull ?? false),
      vehicleKind: vehicle.kind, entryId,
    };
    return entry;
  }
  if (args.category === "labour") {
    const existing = (isCar ? await getCarLabour(email, vehicleId) : await getLabour(email, vehicleId)).find((l) => l.id === entryId);
    if (!existing) return { error: "Couldn't find that labour entry - it may have been deleted, or check the dashboard directly." };
    const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
    if ("error" in resolvedDate) return resolvedDate;
    const labourCategory = typeof args.labourCategory === "string" && args.labourCategory in labourLabels ? args.labourCategory : existing.category;
    const entry: ProposedEntry = {
      category: "labour", labourCategory, labourLabel: labourLabels[labourCategory],
      description: typeof args.description === "string" ? args.description : existing.notes,
      cost: args.cost ?? existing.cost, date: resolvedDate.date, mileage: args.mileage ?? existing.mileage,
      vehicleKind: vehicle.kind, entryId,
    };
    return entry;
  }
  if (args.category === "fine") {
    const existing = (isCar ? await getCarFines(email, vehicleId) : await getFines(email, vehicleId)).find((f) => f.id === entryId);
    if (!existing) return { error: "Couldn't find that fine - it may have been deleted, or check the dashboard directly." };
    const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
    if ("error" in resolvedDate) return resolvedDate;
    const fineType = typeof args.fineType === "string" && args.fineType in fineLabels ? args.fineType : existing.fineType;
    const entry: ProposedEntry = {
      category: "fine", fineType, fineLabel: fineLabels[fineType],
      description: typeof args.description === "string" ? args.description : existing.notes,
      cost: args.cost ?? existing.cost, date: resolvedDate.date, vehicleKind: vehicle.kind, entryId,
    };
    return entry;
  }

  const existing = (isCar ? await getCarTolls(email, vehicleId) : await getTolls(email, vehicleId)).find((t) => t.id === entryId);
  if (!existing) return { error: "Couldn't find that toll - it may have been deleted, or check the dashboard directly." };
  const resolvedDate = resolveOptionalEditDate(args.date, existing.date);
  if ("error" in resolvedDate) return resolvedDate;
  const tollType = typeof args.tollType === "string" && args.tollType in tollLabels ? args.tollType : existing.tollType;
  const entry: ProposedEntry = {
    category: "toll", tollType, tollLabel: tollLabels[tollType],
    description: typeof args.description === "string" ? args.description : existing.notes,
    cost: args.cost ?? existing.cost, date: resolvedDate.date, vehicleKind: vehicle.kind, entryId,
  };
  return entry;
}

export const EDIT_TOOL_DECLARATIONS = [
  {
    name: "proposeEditEntry",
    description:
      "Draft a change to an entry the signed-in user has ALREADY logged - service, bill, modification/accessory, fuel/charging, labour, fine, or toll. This only prepares a draft for the user to review and confirm themselves on screen - it NEVER changes anything by itself. REQUIRES a real entryId - always look the entry up first (e.g. with getEntries for a date/range, or getLastLoggedJob for 'my last oil change') and use the id it returns; never invent or guess one. Only include the fields that are actually changing - every field left out keeps its current logged value. This can only edit an entry that already exists - it can never delete one.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: {
          type: "STRING",
          enum: ["service", "bill", "mod", "fuel", "labour", "fine", "toll"],
          description: "Which kind of entry this is - must match what it was actually logged as.",
        },
        entryId: { type: "STRING", description: "The real id of the entry to edit, from a prior getEntries or getLastLoggedJob result. Required." },
        cost: { type: "NUMBER", description: "The new amount paid, in GBP, as a plain number - only if the cost is changing." },
        date: { type: "STRING", description: "New ISO date (YYYY-MM-DD) - only if the date is changing." },
        description: { type: "STRING", description: "New short description/notes - only if changing. Not used for 'fuel'." },
        jobType: { type: "STRING", enum: [...Object.keys(JOB_LABELS), ...Object.keys(CAR_JOB_LABELS)], description: "Only for category 'service' - the new job type, only if changing." },
        billType: { type: "STRING", enum: [...Object.keys(BILL_LABELS), ...Object.keys(CAR_BILL_LABELS)], description: "Only for category 'bill' - the new bill type, only if changing." },
        modCategory: { type: "STRING", description: "Only for category 'mod' - the new part/accessory category, in plain words, only if changing." },
        labourCategory: { type: "STRING", description: "Only for category 'labour' - the new labour category, in plain words, only if changing." },
        fineType: { type: "STRING", description: "Only for category 'fine' - the new fine type, in plain words, only if changing." },
        tollType: { type: "STRING", description: "Only for category 'toll' - the new toll/charge type, in plain words, only if changing." },
        litres: { type: "NUMBER", description: "Only for category 'fuel' on a non-electric entry - new litres, only if changing." },
        kwh: { type: "NUMBER", description: "Only for category 'fuel' on an electric-charging entry - new kWh, only if changing." },
        filledToFull: { type: "BOOLEAN", description: "Only for category 'fuel' on a non-electric entry - only if this is changing." },
        mileage: { type: "NUMBER", description: "Only for service/mod/fuel/labour - the new mileage reading, only if changing." },
      },
      required: ["category", "entryId"],
    },
  },
] as const;

// ---- Adding a document to the Vault, drafted then confirmed - the
// model never sees or handles the file itself; it only guesses a
// category/label from the conversation. The actual file is picked (and
// uploaded, straight to the Vault's own /api/vault/documents endpoint,
// never through the generic attachment one above) on the draft card
// itself, the same "review and confirm on screen" boundary as every
// other propose* tool. Gated behind Pro AND 2FA in route.ts, mirroring
// exactly what opening the Vault tab itself already requires (see
// vaultAccess.ts's checkVaultGate) - a locked-but-otherwise-eligible
// account still gets the tool offered, since unlocking happens on the
// card (same VaultAuthModal the Vault tab itself uses), not here.

export interface ProposeVaultDocumentArgs {
  category?: string;
  label?: string;
}

export interface ProposedVaultDocument {
  category: "vaultDocument";
  vehicleKind: "bike" | "car";
  vehicleId: string;
  vaultCategory: VaultDocumentCategory | "";
  label: string;
}

export async function toolProposeVaultDocument(email: string, args: ProposeVaultDocumentArgs) {
  const vehicle = await resolveActiveVehicle(email);
  if (!vehicle) return { error: "No vehicle found on this account." };

  const vaultCategory =
    typeof args.category === "string" && VAULT_CATEGORIES.some((c) => c.key === args.category)
      ? (args.category as VaultDocumentCategory)
      : "";

  const entry: ProposedVaultDocument = {
    category: "vaultDocument",
    vehicleKind: vehicle.kind,
    vehicleId: vehicle.kind === "car" ? vehicle.car.id : vehicle.bike.id,
    vaultCategory,
    label: typeof args.label === "string" ? args.label.trim() : "",
  };
  return entry;
}

export const VAULT_TOOL_DECLARATIONS = [
  {
    name: "proposeVaultDocument",
    description:
      "Draft adding a document to the signed-in user's Vault - secure storage for real paperwork like a V5C logbook, MOT certificate, insurance certificate, driving licence, warranty, or similar (see the knowledge base's own Vault section for the full category list and what it's for). This only prepares a draft; the user picks the actual file themselves and confirms on screen - it NEVER uploads or saves anything by itself, and you never see or need the file's own contents. Only call this when they're clearly asking to store/add a document to the Vault, not for logging a cost (use proposeLogEntry for that instead). Guess the best category from what they describe, and a short label if one makes sense (e.g. 'V5C', 'MOT 2026') - both stay editable on the card.",
    parameters: {
      type: "OBJECT",
      properties: {
        category: {
          type: "STRING",
          enum: VAULT_CATEGORIES.map((c) => c.key),
          description: "Best-guess Vault category for this document.",
        },
        label: { type: "STRING", description: "Optional short label for the document, e.g. 'V5C' or 'MOT 2026'." },
      },
      required: [],
    },
  },
] as const;

// Merges the session's own attachment (if any) onto a successful draft,
// without every branch inside toolProposeLogEntry/toolProposeEditEntry
// needing to thread it through their own dozen-plus return points - a
// single wrapping point here instead. Left untouched on an error result.
function withAttachment<T extends { error: string } | Record<string, unknown>>(result: T, attachment?: Attachment): T {
  if (!attachment || !result || "error" in result) return result;
  return { ...result, attachment };
}

// Single dispatch point - the API route calls this instead of a
// hand-written switch of its own, so the set of callable tools is
// defined in exactly one place.
export async function runAssistantTool(
  name: string,
  args: Record<string, unknown>,
  email: string,
  reportToken?: string,
  compareContext?: CompareContext,
  // Always route.ts's own value (whatever the person attached to this
  // chat turn's own message, already uploaded server-side before the
  // model ever runs) - never read from `args`, for the same reason
  // reportToken/compareContext above never are.
  attachment?: Attachment
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
    const result = await toolProposeLogEntry(email, args as ProposeLogEntryArgs);
    return withAttachment(result, attachment);
  }
  if (name === "proposeSettingsChange") {
    return toolProposeSettingsChange(email, args as ProposeSettingsChangeArgs);
  }
  if (name === "proposeShareLink") {
    return toolProposeShareLink(email, args as ProposeShareLinkArgs);
  }
  if (name === "proposeEditEntry") {
    const result = await toolProposeEditEntry(email, args as ProposeEditEntryArgs);
    return withAttachment(result, attachment);
  }
  if (name === "proposeVaultDocument") {
    return toolProposeVaultDocument(email, args as ProposeVaultDocumentArgs);
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
