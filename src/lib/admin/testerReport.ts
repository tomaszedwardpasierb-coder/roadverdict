// Place at: src/lib/admin/testerReport.ts
//
// What /tomasz's "Testers & activity" tab shows, worked out from what the
// accounts list already loads (accountActivity.ts) - so there are no new
// queries here, and every part is a plain function that can be tested:
//   - the tester grid: one row per tester, one square per day, with totals
//     for Google's production-access form;
//   - a 30-day daily-active-users chart, app vs website, testers kept apart;
//   - the ten most active accounts.
// Callers pass the SAME `now` they gave getAccountActivity, so the days here
// line up with the per-day lists it returns.
import { ukDay } from "@/lib/admin/userActivity";
import type { AccountActivity } from "@/lib/admin/accountActivity";

export interface ReportAccount {
  email: string;
  createdAt: string;
  tags?: string[];
}

export type ActivityByEmail = Record<string, AccountActivity | undefined>;

const DAY_MS = 24 * 60 * 60 * 1000;
// Google's closed-test rule is about 14 days; the chart shows a month.
export const GRID_DAYS = 14;
export const CHART_DAYS = 30;

export function isTester(account: ReportAccount): boolean {
  return (account.tags ?? []).includes("tester");
}

// "5h ago" style, for the panels. Pure, so it can be tested.
export function formatAgo(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// UK dates, oldest first, ending today.
export function lastDays(count: number, now: Date): string[] {
  return Array.from({ length: count }, (_, i) => ukDay(new Date(now.getTime() - (count - 1 - i) * DAY_MS)));
}

// ---------------------------------------------------------------- tester grid

export interface TesterGridRow {
  email: string;
  joinedAt: string;
  lastSeenAt: string | null;
  usesApp: boolean;
  // One per day in TesterGrid.days: true when they used it (a visit or an entry).
  cells: boolean[];
  activeDays: number;
  entries: number;
  receiptScans: number;
}

export interface TesterGridTotals {
  testers: number;
  signedInToApp: number;
  // Used it on at least one of the grid's days.
  active: number;
  entries: number;
  receiptScans: number;
}

export interface TesterGrid {
  days: string[];
  rows: TesterGridRow[];
  totals: TesterGridTotals;
}

export function buildTesterGrid(
  accounts: ReportAccount[],
  activity: ActivityByEmail,
  receiptScans: Map<string, number>,
  now: Date,
  exclude: string[] = []
): TesterGrid {
  const days = lastDays(GRID_DAYS, now);
  const rows: TesterGridRow[] = accounts
    .filter((a) => isTester(a) && !exclude.includes(a.email))
    .map((a) => {
      const act = activity[a.email];
      const spark = act?.spark30 ?? [];
      // The last 14 days of the per-day list, padded on the left if it is shorter.
      const recent = [...Array<number>(Math.max(0, GRID_DAYS - spark.length)).fill(0), ...spark.slice(-GRID_DAYS)];
      const cells = recent.map((v) => v > 0);
      return {
        email: a.email,
        joinedAt: a.createdAt,
        lastSeenAt: act?.lastSeenAt ?? null,
        usesApp: act?.usesApp ?? false,
        cells,
        activeDays: cells.filter(Boolean).length,
        entries: act?.entriesTotal ?? 0,
        receiptScans: receiptScans.get(a.email) ?? 0,
      };
    })
    .sort((a, b) => b.activeDays - a.activeDays || b.entries - a.entries || a.email.localeCompare(b.email));

  return {
    days,
    rows,
    totals: {
      testers: rows.length,
      signedInToApp: rows.filter((r) => r.usesApp).length,
      active: rows.filter((r) => r.activeDays > 0).length,
      entries: rows.reduce((n, r) => n + r.entries, 0),
      receiptScans: rows.reduce((n, r) => n + r.receiptScans, 0),
    },
  };
}

// ------------------------------------------------------- daily active users

export interface DauDay {
  day: string;
  app: number;
  web: number;
  // Active, but the day was recorded before the app/web split existed.
  unknown: number;
  total: number;
}

export interface DauSeries {
  days: DauDay[];
  peak: number;
  today: number;
}

export interface DailyActive {
  testers: DauSeries;
  others: DauSeries;
}

function finish(days: DauDay[]): DauSeries {
  return { days, peak: Math.max(0, ...days.map((d) => d.total)), today: days.at(-1)?.total ?? 0 };
}

// Each account counts once per day: as "app" if any visit that day was from the
// app, else "web", else "unknown" (see accountActivity.ts's clientByDay).
export function buildDailyActive(accounts: ReportAccount[], activity: ActivityByEmail, now: Date, exclude: string[] = []): DailyActive {
  const days = lastDays(CHART_DAYS, now);
  const blank = (): DauDay[] => days.map((day) => ({ day, app: 0, web: 0, unknown: 0, total: 0 }));
  const testers = blank();
  const others = blank();
  for (const a of accounts) {
    if (exclude.includes(a.email)) continue;
    const act = activity[a.email];
    if (!act) continue;
    const target = isTester(a) ? testers : others;
    act.clientByDay.slice(-CHART_DAYS).forEach((client, i) => {
      if (client === null || !target[i]) return;
      target[i][client] += 1;
      target[i].total += 1;
    });
  }
  return { testers: finish(testers), others: finish(others) };
}

// ------------------------------------------------------------------ top ten

export interface TopActiveRow {
  email: string;
  tags: string[];
  activeDays: number;
  entries: number;
  lastSeenAt: string | null;
  usesApp: boolean;
}

// Most days used in the last 14, then most entries in those days, then most
// recent. Accounts with no activity in that time aren't listed.
export function topActive(accounts: ReportAccount[], activity: ActivityByEmail, limit = 10, exclude: string[] = []): TopActiveRow[] {
  const ranked = accounts
    .filter((a) => !exclude.includes(a.email))
    .map((a) => ({ account: a, act: activity[a.email] }))
    .filter((x): x is { account: ReportAccount; act: AccountActivity } => !!x.act && x.act.activeDays14 > 0);
  ranked.sort(
    (x, y) =>
      y.act.activeDays14 - x.act.activeDays14 ||
      y.act.entries14 - x.act.entries14 ||
      y.act.lastActivityAt.localeCompare(x.act.lastActivityAt) ||
      x.account.email.localeCompare(y.account.email)
  );
  return ranked.slice(0, limit).map(({ account, act }) => ({
    email: account.email,
    tags: account.tags ?? [],
    activeDays: act.activeDays14,
    entries: act.entries14,
    lastSeenAt: act.lastSeenAt,
    usesApp: act.usesApp,
  }));
}
