// Place at: src/lib/admin/userActivity.ts
//
// "Last seen" for /tomasz's accounts list. getSession() calls noteActivity
// on signed-in requests; it writes at most once per 30 minutes per account
// (per server instance), so a screen firing a dozen API calls costs one
// write at most, and each write counts as one visit on that UK day. One
// small document per account, in the account's own partition; days older
// than 60 are dropped. It's never awaited by the request and never throws -
// bookkeeping can't slow down or break anything real.
import { getContainer } from "@/lib/cosmos";

export type ActivityClient = "web" | "app";

export interface UserActivityDoc {
  id: string;
  pk: string;
  type: "userActivity";
  email: string;
  lastSeenAt: string;
  lastClient: ActivityClient;
  // UK date (YYYY-MM-DD) -> visits that day.
  days: Record<string, number>;
}

const THROTTLE_MS = 30 * 60 * 1000;
const KEEP_DAYS = 60;
const lastWritten = new Map<string, number>();

export function ukDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

export function activityDocId(email: string): string {
  return `activity::${email}`;
}

export async function noteActivity(email: string, client: ActivityClient, now: Date = new Date()): Promise<void> {
  const last = lastWritten.get(email);
  if (last !== undefined && now.getTime() - last < THROTTLE_MS) return;
  lastWritten.set(email, now.getTime());
  try {
    const container = getContainer();
    const id = activityDocId(email);
    let existing: UserActivityDoc | undefined;
    try {
      existing = (await container.item(id, email).read<UserActivityDoc>()).resource;
    } catch {
      existing = undefined;
    }
    const days = { ...(existing?.days ?? {}) };
    const today = ukDay(now);
    days[today] = (days[today] ?? 0) + 1;
    const cutoff = ukDay(new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000));
    for (const day of Object.keys(days)) if (day < cutoff) delete days[day];
    const doc: UserActivityDoc = { id, pk: email, type: "userActivity", email, lastSeenAt: now.toISOString(), lastClient: client, days };
    await container.items.upsert(doc);
  } catch {
    // Never let bookkeeping fail a request.
  }
}

export async function getAllUserActivity(): Promise<Map<string, UserActivityDoc>> {
  try {
    const { resources } = await getContainer()
      .items.query<UserActivityDoc>({ query: "SELECT * FROM c WHERE c.type = 'userActivity'" })
      .fetchAll();
    return new Map(resources.map((r) => [r.email, r]));
  } catch {
    return new Map();
  }
}

// Tests only.
export function resetActivityThrottle(): void {
  lastWritten.clear();
}
