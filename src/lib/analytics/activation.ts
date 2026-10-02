// Place at: src/lib/analytics/activation.ts
//
// What people do after signing up, read from the records themselves rather
// than from counters (see funnel.ts), so it covers every account from the
// start instead of only since a counter was added:
//  - each week, how many people added something real - the number the
//    growth plan watches most closely, since that's when RoadVerdict starts
//    to hold something they'd miss;
//  - for each week's new accounts, how many added a vehicle, a first real
//    record, and something again in their second week.
//
// "Real" means a record the owner made: a service, fill-up, bill, part,
// labour, fine or toll, bike or car. Not an MOT test imported from DVSA
// (a £0 "mot-test" bill) and not an instalment the app wrote by itself
// (source "auto"). The demo account never counts. Admin-only reading;
// nothing here is stored.
import { getContainer } from "@/lib/cosmos";
import { DEMO_EMAIL } from "@/lib/tracker/demoSeed";

export const REAL_RECORD_TYPES = [
  "serviceRecord",
  "fuelLog",
  "bill",
  "mod",
  "labour",
  "fine",
  "toll",
  "carServiceRecord",
  "carFuelLog",
  "carBill",
  "carMod",
  "carLabour",
  "carFine",
  "carToll",
] as const;

export type RecordRow = { pk: string; createdAt: string; type: string; billType?: string; cost?: number; source?: string };
export type AccountRow = { email: string; createdAt: string };

export function isRealRecord(r: RecordRow): boolean {
  if (r.pk === DEMO_EMAIL) return false;
  if (r.type === "bill" || r.type === "carBill") {
    if (r.source === "auto") return false;
    if (r.billType === "mot-test" && !r.cost) return false;
  }
  return true;
}

const DAY_MS = 86_400_000;
export const ACTIVITY_WEEKS = 8;
export const COHORT_WEEKS = 6;

// A day as the owner sees it - UK time, not UTC.
function londonDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

// The Monday that starts the UK week containing `date`, as YYYY-MM-DD.
export function weekStartOf(date: Date): string {
  const day = londonDay(date);
  const noon = new Date(`${day}T12:00:00Z`);
  const sinceMonday = (noon.getUTCDay() + 6) % 7;
  return new Date(noon.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10);
}

function weekStarts(now: Date, count: number): string[] {
  const out: string[] = [];
  let cursor = new Date(`${weekStartOf(now)}T12:00:00Z`);
  for (let i = 0; i < count; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() - 7 * DAY_MS);
  }
  return out;
}

export type ActivityWeek = { weekStart: string; people: number };
export type Cohort = {
  weekStart: string;
  accounts: number;
  addedVehicle: number;
  addedRecord: number;
  // Only accounts at least two weeks old can have had a second week.
  week2Eligible: number;
  week2: number;
};
export type ActivationStats = { weeks: ActivityWeek[]; cohorts: Cohort[] };

// The earliest moment buildActivationStats looks at - the query below
// fetches records from here on. A day early, since a UK Monday starts at
// 23:00 UTC the evening before during summer time.
export function activationWindowStart(now: Date): string {
  const starts = weekStarts(now, Math.max(ACTIVITY_WEEKS, COHORT_WEEKS));
  return new Date(new Date(`${starts[starts.length - 1]}T00:00:00.000Z`).getTime() - DAY_MS).toISOString();
}

// The pure half, newest week first: separate from the queries so it can be
// tested on plain rows.
export function buildActivationStats(input: { now: Date; accounts: AccountRow[]; records: RecordRow[]; vehicleOwners: Set<string> }): ActivationStats {
  const { now, accounts, vehicleOwners } = input;
  const records = input.records.filter(isRealRecord);

  const peopleByWeek = new Map<string, Set<string>>();
  for (const r of records) {
    const week = weekStartOf(new Date(r.createdAt));
    if (!peopleByWeek.has(week)) peopleByWeek.set(week, new Set());
    peopleByWeek.get(week)!.add(r.pk);
  }
  const weeks = weekStarts(now, ACTIVITY_WEEKS).map((weekStart) => ({ weekStart, people: peopleByWeek.get(weekStart)?.size ?? 0 }));

  const recordTimesByOwner = new Map<string, number[]>();
  for (const r of records) {
    if (!recordTimesByOwner.has(r.pk)) recordTimesByOwner.set(r.pk, []);
    recordTimesByOwner.get(r.pk)!.push(new Date(r.createdAt).getTime());
  }

  const cohorts = weekStarts(now, COHORT_WEEKS).map((weekStart) => {
    const members = accounts.filter((a) => a.email !== DEMO_EMAIL && a.createdAt && weekStartOf(new Date(a.createdAt)) === weekStart);
    let addedVehicle = 0;
    let addedRecord = 0;
    let week2Eligible = 0;
    let week2 = 0;
    for (const a of members) {
      const created = new Date(a.createdAt).getTime();
      const times = recordTimesByOwner.get(a.email) ?? [];
      if (vehicleOwners.has(a.email)) addedVehicle++;
      if (times.some((t) => t >= created)) addedRecord++;
      if (now.getTime() - created >= 14 * DAY_MS) {
        week2Eligible++;
        if (times.some((t) => t >= created + 7 * DAY_MS && t < created + 14 * DAY_MS)) week2++;
      }
    }
    return { weekStart, accounts: members.length, addedVehicle, addedRecord, week2Eligible, week2 };
  });

  return { weeks, cohorts };
}

export async function getActivationStats(accounts: AccountRow[], now = new Date()): Promise<ActivationStats> {
  const container = getContainer();
  const [recordsResult, vehiclesResult] = await Promise.all([
    container.items
      .query<RecordRow>({
        query:
          "SELECT c.pk, c.createdAt, c.type, c.billType, c.cost, c.source FROM c WHERE ARRAY_CONTAINS(@types, c.type) AND c.createdAt >= @since",
        parameters: [
          { name: "@types", value: [...REAL_RECORD_TYPES] },
          { name: "@since", value: activationWindowStart(now) },
        ],
      })
      .fetchAll(),
    container.items.query<{ pk: string }>({ query: "SELECT c.pk FROM c WHERE c.type = 'bike' OR c.type = 'car'" }).fetchAll(),
  ]);
  return buildActivationStats({
    now,
    accounts,
    records: recordsResult.resources,
    vehicleOwners: new Set(vehiclesResult.resources.map((v) => v.pk)),
  });
}
