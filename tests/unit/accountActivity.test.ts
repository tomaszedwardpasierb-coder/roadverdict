// Place at: tests/unit/accountActivity.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), activity: new Map<string, unknown>() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: (spec: { query: string }) => ({ fetchAll: async () => ({ resources: mocks.query(spec.query) }) }) },
  }),
}));
vi.mock("@/lib/admin/userActivity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/userActivity")>()),
  getAllUserActivity: async () => mocks.activity,
}));

import { accountStatus, getAccountActivity } from "@/lib/admin/accountActivity";

const NOW = new Date("2026-10-07T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("accountStatus", () => {
  it("is never-started without a vehicle, whatever the dates", () => {
    expect(accountStatus(0, daysAgo(0), NOW)).toBe("never-started");
  });

  it("uses 7 and 30 days for active, cooling and inactive", () => {
    expect(accountStatus(1, daysAgo(7), NOW)).toBe("active");
    expect(accountStatus(1, daysAgo(8), NOW)).toBe("cooling");
    expect(accountStatus(1, daysAgo(30), NOW)).toBe("cooling");
    expect(accountStatus(1, daysAgo(31), NOW)).toBe("inactive");
  });
});

describe("getAccountActivity", () => {
  beforeEach(() => {
    mocks.activity = new Map([
      [
        "a@example.com",
        {
          email: "a@example.com",
          lastSeenAt: daysAgo(1),
          lastClient: "app",
          days: { "2026-10-06": 3, "2026-10-05": 1 },
          appDays: { "2026-10-06": 2 },
          splitFrom: "2026-10-05",
        },
      ],
    ]);
    mocks.query.mockImplementation((q: string) => {
      if (q.includes("'bike'")) {
        return [{ pk: "a@example.com" }, { pk: "b@example.com" }, { pk: "b@example.com", transferredTo: "x@example.com" }];
      }
      if (q.includes("ARRAY_CONTAINS")) {
        return [
          { pk: "b@example.com", createdAt: daysAgo(40) },
          { pk: "a@example.com", createdAt: daysAgo(2) },
          { pk: "a@example.com", createdAt: daysAgo(20) },
        ];
      }
      if (q.includes("'session'")) {
        return [{ pk: "b@example.com", createdAt: daysAgo(45) }, { pk: "a@example.com", createdAt: daysAgo(3), client: "app" }];
      }
      return [];
    });
  });

  it("combines last seen, sessions and entries into a status", async () => {
    const result = await getAccountActivity(
      [
        { email: "a@example.com", createdAt: daysAgo(20) },
        { email: "b@example.com", createdAt: daysAgo(60) },
        { email: "c@example.com", createdAt: daysAgo(1) },
      ],
      NOW
    );
    expect(result["a@example.com"]).toMatchObject({ status: "active", vehicles: 1, usesApp: true, entries14: 1, lastClient: "app" });
    expect(result["a@example.com"].activeDays14).toBe(2);
    expect(result["a@example.com"].spark30).toHaveLength(30);
    // A transferred vehicle doesn't count; last activity comes from old entries and sessions.
    expect(result["b@example.com"]).toMatchObject({ status: "inactive", vehicles: 1, usesApp: false, entries14: 0 });
    expect(result["c@example.com"]).toMatchObject({ status: "never-started", vehicles: 0 });
  });

  it("counts sessions and all entries, and says which client was used each day", async () => {
    const result = await getAccountActivity([{ email: "a@example.com", createdAt: daysAgo(60) }], NOW);
    const a = result["a@example.com"];
    expect(a.sessions).toBe(1);
    expect(a.entriesTotal).toBe(2);
    // Index 29 is today (7 Oct), 28 is 6 Oct, and so on back 30 days.
    expect(a.clientByDay).toHaveLength(30);
    expect(a.clientByDay[28]).toBe("app"); // 6 Oct: two of the three visits were from the app
    expect(a.clientByDay[27]).toBe("web"); // 5 Oct: a visit after the split began, none from the app
    expect(a.clientByDay[9]).toBe("unknown"); // 20 days ago: an entry only, before the split
    expect(a.clientByDay[20]).toBeNull(); // nothing that day
  });
});
