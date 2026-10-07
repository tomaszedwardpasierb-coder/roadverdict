// Place at: src/lib/admin/accountActivity.ts
//
// Who's actually using RoadVerdict, for /tomasz's accounts list: a status
// colour per account, when they were last seen, active days and entries
// over the last 14 days, and a 30-day activity strip. Built from the
// "last seen" records (userActivity.ts) plus what's already stored -
// sessions and logged entries - so accounts from before that tracking
// existed still get a sensible "last activity". Admin-only reads; any
// failed query just leaves its part empty.
import { getContainer } from "@/lib/cosmos";
import { getAllUserActivity, ukDay, type ActivityClient } from "./userActivity";

export type AccountStatus = "active" | "cooling" | "inactive" | "never-started";

// Used it in the last 7 days = active; 8-30 = cooling; longer = inactive.
// No vehicle at all = never started, whatever the dates say.
export const ACTIVE_WITHIN_DAYS = 7;
export const COOLING_WITHIN_DAYS = 30;

export const ENTRY_TYPES = [
  "serviceRecord", "fuelLog", "labour", "mod", "bill", "fine", "toll",
  "carServiceRecord", "carFuelLog", "carLabour", "carMod", "carBill", "carFine", "carToll",
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
// How far back entries and sessions are read to work out "last activity" -
// anything older is "inactive" whichever way.
const LOOKBACK_DAYS = 90;

export interface AccountActivity {
  lastSeenAt: string | null;
  lastClient: ActivityClient | null;
  lastActivityAt: string;
  status: AccountStatus;
  activeDays14: number;
  entries14: number;
  vehicles: number;
  usesApp: boolean;
  // Oldest to newest, one value per UK day: visits + entries logged.
  spark30: number[];
}

export function accountStatus(vehicles: number, lastActivityAt: string, now: Date): AccountStatus {
  if (vehicles === 0) return "never-started";
  const ageDays = (now.getTime() - new Date(lastActivityAt).getTime()) / DAY_MS;
  if (ageDays <= ACTIVE_WITHIN_DAYS) return "active";
  if (ageDays <= COOLING_WITHIN_DAYS) return "cooling";
  return "inactive";
}

function latest(...isos: (string | null | undefined)[]): string {
  return isos.filter((x): x is string => !!x).sort().at(-1)!;
}

async function query<T>(text: string, parameters: { name: string; value: unknown }[] = []): Promise<T[]> {
  try {
    const { resources } = await getContainer()
      .items.query<T>({ query: text, parameters: parameters as never })
      .fetchAll();
    return resources;
  } catch {
    return [];
  }
}

export async function getAccountActivity(
  accounts: { email: string; createdAt: string }[],
  now: Date = new Date()
): Promise<Record<string, AccountActivity>> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * DAY_MS).toISOString();
  const [activity, vehicles, entries, sessions] = await Promise.all([
    getAllUserActivity(),
    query<{ pk: string; transferredTo?: unknown }>("SELECT c.pk, c.transferredTo FROM c WHERE c.type = 'bike' OR c.type = 'car'"),
    query<{ pk: string; createdAt: string }>(
      "SELECT c.pk, c.createdAt FROM c WHERE ARRAY_CONTAINS(@types, c.type) AND c.createdAt >= @since",
      [{ name: "@types", value: [...ENTRY_TYPES] }, { name: "@since", value: since }]
    ),
    query<{ pk: string; createdAt: string; client?: string }>("SELECT c.pk, c.createdAt, c.client FROM c WHERE c.type = 'session'"),
  ]);

  const vehicleCount = new Map<string, number>();
  for (const v of vehicles) if (!v.transferredTo) vehicleCount.set(v.pk, (vehicleCount.get(v.pk) ?? 0) + 1);

  const entriesByUser = new Map<string, string[]>();
  for (const e of entries) entriesByUser.set(e.pk, [...(entriesByUser.get(e.pk) ?? []), e.createdAt]);

  const lastSession = new Map<string, string>();
  const appUsers = new Set<string>();
  for (const s of sessions) {
    if (s.createdAt > (lastSession.get(s.pk) ?? "")) lastSession.set(s.pk, s.createdAt);
    if (s.client === "app") appUsers.add(s.pk);
  }

  const days30 = Array.from({ length: 30 }, (_, i) => ukDay(new Date(now.getTime() - (29 - i) * DAY_MS)));
  const days14 = new Set(days30.slice(-14));
  const fourteenAgo = now.getTime() - 14 * DAY_MS;

  const result: Record<string, AccountActivity> = {};
  for (const { email, createdAt } of accounts) {
    const a = activity.get(email);
    const userEntries = entriesByUser.get(email) ?? [];
    const perDay = new Map<string, number>();
    for (const [day, visits] of Object.entries(a?.days ?? {})) perDay.set(day, visits);
    for (const at of userEntries) {
      const day = ukDay(new Date(at));
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }
    const lastActivityAt = latest(createdAt, a?.lastSeenAt, lastSession.get(email), ...userEntries);
    const count = vehicleCount.get(email) ?? 0;
    result[email] = {
      lastSeenAt: a?.lastSeenAt ?? null,
      lastClient: a?.lastClient ?? null,
      lastActivityAt,
      status: accountStatus(count, lastActivityAt, now),
      activeDays14: [...perDay.entries()].filter(([day, n]) => days14.has(day) && n > 0).length,
      entries14: userEntries.filter((at) => new Date(at).getTime() >= fourteenAgo).length,
      vehicles: count,
      usesApp: appUsers.has(email) || a?.lastClient === "app",
      spark30: days30.map((day) => perDay.get(day) ?? 0),
    };
  }
  return result;
}
