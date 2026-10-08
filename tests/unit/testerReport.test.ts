// Place at: tests/unit/testerReport.test.ts
//
// /tomasz's "Testers & activity" numbers: the tester grid and its totals for
// Google's form, the 30-day active-users series (app vs website, testers
// apart) and the top ten. Pure functions over what the accounts list loads.
import { describe, expect, it } from "vitest";
import type { AccountActivity } from "@/lib/admin/accountActivity";
import {
  buildDailyActive,
  buildTesterGrid,
  CHART_DAYS,
  formatAgo,
  GRID_DAYS,
  isTester,
  lastDays,
  topActive,
  type ReportAccount,
} from "@/lib/admin/testerReport";

const NOW = new Date("2026-10-08T12:00:00Z");

function act(over: Partial<AccountActivity> = {}): AccountActivity {
  return {
    lastSeenAt: null,
    lastClient: null,
    lastActivityAt: "2026-10-07T10:00:00.000Z",
    status: "active",
    activeDays14: 0,
    entries14: 0,
    vehicles: 1,
    usesApp: false,
    spark30: Array(30).fill(0),
    clientByDay: Array(30).fill(null),
    sessions: 0,
    entriesTotal: 0,
    ...over,
  };
}

// A 30-day list with the given positions (0 = 29 days ago, 29 = today) set.
function sparkAt(...positions: number[]): number[] {
  const s = Array(30).fill(0);
  for (const p of positions) s[p] = 1;
  return s;
}

const tester = (email: string): ReportAccount => ({ email, createdAt: "2026-10-06T08:00:00.000Z", tags: ["tester"] });
const plain = (email: string): ReportAccount => ({ email, createdAt: "2026-09-01T08:00:00.000Z", tags: [] });

describe("lastDays", () => {
  it("lists UK dates oldest first, ending today", () => {
    expect(lastDays(3, NOW)).toEqual(["2026-10-06", "2026-10-07", "2026-10-08"]);
    expect(lastDays(GRID_DAYS, NOW)).toHaveLength(14);
    expect(lastDays(CHART_DAYS, NOW)[0]).toBe("2026-09-09");
  });
});

describe("formatAgo", () => {
  const ago = (mins: number) => formatAgo(new Date(NOW.getTime() - mins * 60000).toISOString(), NOW);
  it("says just now, minutes, hours or days", () => {
    expect(ago(0)).toBe("just now");
    expect(ago(12)).toBe("12m ago");
    expect(ago(60)).toBe("1h ago");
    expect(ago(47 * 60)).toBe("47h ago");
    expect(ago(72 * 60)).toBe("3d ago");
  });

  it("never goes negative when a clock is slightly ahead", () => {
    expect(formatAgo(new Date(NOW.getTime() + 5 * 60000).toISOString(), NOW)).toBe("just now");
  });
});

describe("isTester", () => {
  it("is true only for the tester tag", () => {
    expect(isTester(tester("a@example.com"))).toBe(true);
    expect(isTester({ email: "b@example.com", createdAt: "x", tags: ["friend"] })).toBe(false);
    expect(isTester({ email: "c@example.com", createdAt: "x" })).toBe(false);
  });
});

describe("buildTesterGrid", () => {
  const accounts = [tester("quiet@example.com"), tester("busy@example.com"), plain("customer@example.com"), tester("demo@roadverdict.co.uk")];
  const activity = {
    "busy@example.com": act({ spark30: sparkAt(29, 27, 10), usesApp: true, entriesTotal: 6, lastSeenAt: "2026-10-08T09:00:00.000Z" }),
    "quiet@example.com": act({ spark30: sparkAt(29), usesApp: false, entriesTotal: 1 }),
    "customer@example.com": act({ spark30: sparkAt(29, 28), usesApp: true }),
  };
  const scans = new Map([["busy@example.com", 4], ["quiet@example.com", 1]]);
  const grid = buildTesterGrid(accounts, activity, scans, NOW, ["demo@roadverdict.co.uk"]);

  it("has only testers, one square per day, most active first", () => {
    expect(grid.rows.map((r) => r.email)).toEqual(["busy@example.com", "quiet@example.com"]);
    expect(grid.days).toHaveLength(14);
    const busy = grid.rows[0];
    expect(busy.cells).toHaveLength(14);
    // Only the last 14 of the 30 days: positions 29 and 27 are in range (cells 13 and 11), 10 is not.
    expect(busy.cells[13]).toBe(true);
    expect(busy.cells[11]).toBe(true);
    expect(busy.cells.filter(Boolean)).toHaveLength(2);
    expect(busy.activeDays).toBe(2);
    expect(busy).toMatchObject({ entries: 6, receiptScans: 4, usesApp: true, lastSeenAt: "2026-10-08T09:00:00.000Z" });
  });

  it("totals the testers who signed in, were active, and what they logged", () => {
    expect(grid.totals).toEqual({ testers: 2, signedInToApp: 1, active: 2, entries: 7, receiptScans: 5 });
  });

  it("copes with a tester who has no activity record at all", () => {
    const g = buildTesterGrid([tester("new@example.com")], {}, new Map(), NOW);
    expect(g.rows[0]).toMatchObject({ activeDays: 0, entries: 0, receiptScans: 0, usesApp: false, lastSeenAt: null });
    expect(g.rows[0].cells).toEqual(Array(14).fill(false));
    expect(g.totals).toEqual({ testers: 1, signedInToApp: 0, active: 0, entries: 0, receiptScans: 0 });
  });

  it("breaks ties by entries, then by email", () => {
    const g = buildTesterGrid(
      [tester("b@example.com"), tester("a@example.com"), tester("c@example.com")],
      {
        "a@example.com": act({ spark30: sparkAt(29), entriesTotal: 1 }),
        "b@example.com": act({ spark30: sparkAt(29), entriesTotal: 5 }),
        "c@example.com": act({ spark30: sparkAt(29), entriesTotal: 1 }),
      },
      new Map(),
      NOW
    );
    expect(g.rows.map((r) => r.email)).toEqual(["b@example.com", "a@example.com", "c@example.com"]);
  });
});

describe("buildDailyActive", () => {
  const accounts = [tester("t@example.com"), plain("o1@example.com"), plain("o2@example.com"), plain("demo@roadverdict.co.uk")];
  const byDay = (entries: Record<number, "app" | "web" | "unknown">) => {
    const a: AccountActivity["clientByDay"] = Array(30).fill(null);
    for (const [i, c] of Object.entries(entries)) a[Number(i)] = c;
    return a;
  };
  const activity = {
    "t@example.com": act({ clientByDay: byDay({ 29: "app", 28: "app" }) }),
    "o1@example.com": act({ clientByDay: byDay({ 29: "web", 28: "unknown" }) }),
    "o2@example.com": act({ clientByDay: byDay({ 29: "app" }) }),
    "demo@roadverdict.co.uk": act({ clientByDay: byDay({ 29: "app", 28: "app", 27: "app" }) }),
  };
  const dau = buildDailyActive(accounts, activity, NOW, ["demo@roadverdict.co.uk"]);

  it("keeps testers apart from everyone else", () => {
    expect(dau.testers.days).toHaveLength(30);
    expect(dau.testers.days[29]).toMatchObject({ day: "2026-10-08", app: 1, web: 0, unknown: 0, total: 1 });
    expect(dau.others.days[29]).toMatchObject({ app: 1, web: 1, unknown: 0, total: 2 });
  });

  it("shows days recorded before the split as unknown, and counts each account once a day", () => {
    expect(dau.others.days[28]).toMatchObject({ app: 0, web: 0, unknown: 1, total: 1 });
    expect(dau.others.days[27].total).toBe(0);
  });

  it("leaves out excluded accounts and reports the peak and today", () => {
    expect(dau.others.peak).toBe(2);
    expect(dau.others.today).toBe(2);
    expect(dau.testers.peak).toBe(1);
  });

  it("is all zeros when nobody has any activity", () => {
    const empty = buildDailyActive([plain("x@example.com")], {}, NOW);
    expect(empty.others.peak).toBe(0);
    expect(empty.others.today).toBe(0);
    expect(empty.testers.days.every((d) => d.total === 0)).toBe(true);
  });
});

describe("topActive", () => {
  const accounts = [plain("a@example.com"), plain("b@example.com"), tester("c@example.com"), plain("idle@example.com"), plain("demo@roadverdict.co.uk")];
  const activity = {
    "a@example.com": act({ activeDays14: 5, entries14: 2, lastActivityAt: "2026-10-08T08:00:00.000Z", usesApp: true }),
    "b@example.com": act({ activeDays14: 9, entries14: 0 }),
    "c@example.com": act({ activeDays14: 5, entries14: 7 }),
    "idle@example.com": act({ activeDays14: 0 }),
    "demo@roadverdict.co.uk": act({ activeDays14: 14, entries14: 99 }),
  };

  it("ranks by days used, then entries, and skips accounts with no recent use or excluded ones", () => {
    const top = topActive(accounts, activity, 10, ["demo@roadverdict.co.uk"]);
    expect(top.map((r) => r.email)).toEqual(["b@example.com", "c@example.com", "a@example.com"]);
    expect(top[1].tags).toEqual(["tester"]);
    expect(top[2]).toMatchObject({ activeDays: 5, entries: 2, usesApp: true });
  });

  it("stops at the limit", () => {
    expect(topActive(accounts, activity, 2, ["demo@roadverdict.co.uk"])).toHaveLength(2);
  });
});
