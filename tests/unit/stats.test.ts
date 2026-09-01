import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  itemRead: vi.fn(),
  containerRead: vi.fn(),
}));

const mockContainer = {
  items: {
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
  },
  item: vi.fn(() => ({ read: mocks.itemRead })),
  read: mocks.containerRead,
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  getDbStats,
  getActiveSessionCount,
  getTotalUserCount,
  getFuelPriceStatus,
  getReminderCronStatus,
  getBikeIdBackfillStatus,
  getUserBackfillStatus,
  getSeedAssistantConfigStatus,
  getMagicLinkRequests,
  getRecentSessions,
  browserFamily,
  getBrowserBreakdown,
  getServerHealth,
  getCosmosContainerInfo,
  getDetailedCounts,
} from "@/lib/admin/stats";

function resetMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.items.query.mockClear();
  mockContainer.item.mockClear();
}

describe("getDbStats", () => {
  beforeEach(resetMocks);

  it("returns the type counts sorted by count descending", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { type: "session", count: 5 },
        { type: "bike", count: 40 },
        { type: "user", count: 12 },
      ],
    });
    const result = await getDbStats();
    expect(result.map((r) => r.type)).toEqual(["bike", "user", "session"]);
  });
});

describe("getActiveSessionCount", () => {
  beforeEach(resetMocks);

  it("returns the count from the query", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [7] });
    expect(await getActiveSessionCount()).toBe(7);
  });

  it("falls back to 0 when no row comes back", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getActiveSessionCount()).toBe(0);
  });

  it("filters for sessions whose expiresAt is still in the future", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [0] });
    await getActiveSessionCount();
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.expiresAt > @now");
  });
});

describe("getTotalUserCount", () => {
  beforeEach(resetMocks);

  it("returns the count of user-type docs", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [42] });
    expect(await getTotalUserCount()).toBe(42);
  });

  it("falls back to 0 when no row comes back", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getTotalUserCount()).toBe(0);
  });
});

describe("getFuelPriceStatus", () => {
  beforeEach(resetMocks);

  it("returns the price and week when the doc exists", async () => {
    mocks.itemRead.mockResolvedValue({ resource: { pricePenceLitre: 145.9, weekCommencing: "2026-01-05" } });
    expect(await getFuelPriceStatus()).toEqual({ pricePenceLitre: 145.9, weekCommencing: "2026-01-05" });
    expect(mockContainer.item).toHaveBeenCalledWith("fuelPrice", "system");
  });

  it("returns null when no doc exists", async () => {
    mocks.itemRead.mockResolvedValue({ resource: undefined });
    expect(await getFuelPriceStatus()).toBeNull();
  });

  it("fails soft to null if the read throws", async () => {
    mocks.itemRead.mockRejectedValue(new Error("cosmos unavailable"));
    expect(await getFuelPriceStatus()).toBeNull();
  });
});

// getReminderCronStatus / getBikeIdBackfillStatus / getUserBackfillStatus /
// getSeedAssistantConfigStatus all share the same shape: read a fixed
// cronStatus::* doc from the "system" partition, return it as-is, null if
// missing, null if the read throws. Table-driven so a copy/paste mistake in
// any one of the four id/pk constants gets caught.
describe("cron/backfill status getters", () => {
  beforeEach(resetMocks);

  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ["getReminderCronStatus", getReminderCronStatus, "cronStatus::reminders"],
    ["getBikeIdBackfillStatus", getBikeIdBackfillStatus, "cronStatus::backfillBikeId"],
    ["getUserBackfillStatus", getUserBackfillStatus, "cronStatus::backfillUsers"],
    ["getSeedAssistantConfigStatus", getSeedAssistantConfigStatus, "cronStatus::seedAssistantConfig"],
  ];

  it.each(cases)("%s reads item(%s, 'system') and returns the doc as-is", async (_name, fn, id) => {
    const doc = { lastRunAt: "2026-01-01T00:00:00.000Z", checked: 3 };
    mocks.itemRead.mockResolvedValue({ resource: doc });
    expect(await fn()).toEqual(doc);
    expect(mockContainer.item).toHaveBeenCalledWith(id, "system");
  });

  it.each(cases)("%s returns null when the doc is missing", async (_name, fn) => {
    mocks.itemRead.mockResolvedValue({ resource: undefined });
    expect(await fn()).toBeNull();
  });

  it.each(cases)("%s fails soft to null if the read throws", async (_name, fn) => {
    mocks.itemRead.mockRejectedValue(new Error("cosmos unavailable"));
    expect(await fn()).toBeNull();
  });
});

describe("getMagicLinkRequests", () => {
  beforeEach(resetMocks);

  it("sorts by lastRequestedAt descending", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { email: "a@example.com", requestCount: 1, lastRequestedAt: "2026-01-01T00:00:00.000Z" },
        { email: "b@example.com", requestCount: 3, lastRequestedAt: "2026-03-01T00:00:00.000Z" },
      ],
    });
    const result = await getMagicLinkRequests();
    expect(result.map((r) => r.email)).toEqual(["b@example.com", "a@example.com"]);
  });

  it("groups by pk (email) over magicLink docs", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getMagicLinkRequests();
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.type = 'magicLink'");
    expect(query.query).toContain("GROUP BY c.pk");
  });
});

describe("getRecentSessions", () => {
  beforeEach(resetMocks);

  it("defaults to a limit of 50", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getRecentSessions();
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@limit", value: 50 }]);
  });

  it("passes a custom limit through", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getRecentSessions(5);
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@limit", value: 5 }]);
  });

  it("returns the session rows unmodified", async () => {
    const rows = [{ email: "a@example.com", createdAt: "2026-01-01T00:00:00.000Z" }];
    mocks.fetchAll.mockResolvedValue({ resources: rows });
    expect(await getRecentSessions()).toEqual(rows);
  });
});

describe("browserFamily", () => {
  it("returns Unknown when there is no user agent", () => {
    expect(browserFamily(undefined)).toBe("Unknown");
  });

  it("detects Edge even though its UA also contains Chrome and Safari tokens", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59";
    expect(browserFamily(ua)).toBe("Edge");
  });

  it("detects Samsung Internet", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/12.1 Chrome/71.0.3578.99 Mobile Safari/537.36";
    expect(browserFamily(ua)).toBe("Samsung Internet");
  });

  it("detects Opera even though its UA also contains Chrome and Safari tokens", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 OPR/77.0.4054.203";
    expect(browserFamily(ua)).toBe("Opera");
  });

  it("detects Firefox", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0";
    expect(browserFamily(ua)).toBe("Firefox");
  });

  it("detects Chrome (which also contains a Safari token) when nothing more specific matched", () => {
    const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36";
    expect(browserFamily(ua)).toBe("Chrome");
  });

  it("detects Safari on its own (no Chrome token) as Safari, not Other", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
    expect(browserFamily(ua)).toBe("Safari");
  });

  it("falls back to Other for an unrecognised user agent", () => {
    expect(browserFamily("curl/7.68.0")).toBe("Other");
  });
});

describe("getBrowserBreakdown", () => {
  beforeEach(resetMocks);

  it("aggregates session docs by browser family, sorted by count descending", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { userAgent: "Mozilla/5.0 Firefox/115.0" },
        { userAgent: "Mozilla/5.0 Chrome/115.0 Safari/537.36" },
        { userAgent: "Mozilla/5.0 Chrome/115.0 Safari/537.36" },
        { userAgent: undefined },
      ],
    });
    const result = await getBrowserBreakdown();
    expect(result).toEqual([
      { browser: "Chrome", count: 2 },
      { browser: "Firefox", count: 1 },
      { browser: "Unknown", count: 1 },
    ]);
  });

  it("returns an empty array when there are no session docs", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getBrowserBreakdown()).toEqual([]);
  });
});

describe("getServerHealth", () => {
  const envKeys = [
    "WEBSITE_SITE_NAME",
    "WEBSITE_HOSTNAME",
    "REGION_NAME",
    "WEBSITE_RESOURCE_GROUP",
    "WEBSITE_INSTANCE_ID",
  ] as const;
  const originalValues: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) originalValues[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of envKeys) {
      if (originalValues[key] === undefined) delete process.env[key];
      else process.env[key] = originalValues[key];
    }
  });

  it("reports 'unknown' for every Azure env var that isn't set", () => {
    for (const key of envKeys) delete process.env[key];
    const health = getServerHealth();
    expect(health.siteName).toBe("unknown");
    expect(health.hostname).toBe("unknown");
    expect(health.region).toBe("unknown");
    expect(health.resourceGroup).toBe("unknown");
    expect(health.instanceId).toBe("unknown");
  });

  it("reflects the real env vars when they are set, truncating the instance id to 12 chars", () => {
    process.env.WEBSITE_SITE_NAME = "roadverdict";
    process.env.WEBSITE_HOSTNAME = "roadverdict.azurewebsites.net";
    process.env.REGION_NAME = "UK South";
    process.env.WEBSITE_RESOURCE_GROUP = "rg-roadverdict";
    process.env.WEBSITE_INSTANCE_ID = "abcdefghijklmnopqrstuvwxyz0123456789";

    const health = getServerHealth();

    expect(health.siteName).toBe("roadverdict");
    expect(health.hostname).toBe("roadverdict.azurewebsites.net");
    expect(health.region).toBe("UK South");
    expect(health.resourceGroup).toBe("rg-roadverdict");
    expect(health.instanceId).toBe("abcdefghijkl");
    expect(health.instanceId).toHaveLength(12);
  });

  it("reports real process info for node version and uptime", () => {
    const health = getServerHealth();
    expect(health.nodeVersion).toBe(process.version);
    expect(health.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(health.uptimeSeconds)).toBe(true);
    expect(health.memoryUsedMB).toBeGreaterThanOrEqual(0);
    expect(health.memoryTotalMB).toBeGreaterThanOrEqual(0);
  });
});

describe("getCosmosContainerInfo", () => {
  beforeEach(resetMocks);

  it("extracts partition key path, ttl and indexing mode when present", async () => {
    mocks.containerRead.mockResolvedValue({
      resource: {
        partitionKey: { paths: ["/pk"] },
        defaultTtl: -1,
        indexingPolicy: { indexingMode: "consistent" },
      },
    });
    expect(await getCosmosContainerInfo()).toEqual({
      partitionKeyPath: "/pk",
      defaultTtl: -1,
      indexingMode: "consistent",
    });
  });

  it("falls back to defaults when nested fields are missing", async () => {
    mocks.containerRead.mockResolvedValue({ resource: {} });
    expect(await getCosmosContainerInfo()).toEqual({
      partitionKeyPath: "unknown",
      defaultTtl: null,
      indexingMode: "unknown",
    });
  });

  it("returns null when there is no container resource", async () => {
    mocks.containerRead.mockResolvedValue({ resource: undefined });
    expect(await getCosmosContainerInfo()).toBeNull();
  });

  it("fails soft to null if the read throws", async () => {
    mocks.containerRead.mockRejectedValue(new Error("cosmos unavailable"));
    expect(await getCosmosContainerInfo()).toBeNull();
  });
});

describe("getDetailedCounts", () => {
  beforeEach(resetMocks);

  it("combines expired-session, used and unused magic-link counts", async () => {
    mocks.fetchAll
      .mockResolvedValueOnce({ resources: [4] }) // expired sessions
      .mockResolvedValueOnce({ resources: [9] }) // used magic links
      .mockResolvedValueOnce({ resources: [2] }); // unused magic links

    expect(await getDetailedCounts()).toEqual({
      expiredSessions: 4,
      usedMagicLinks: 9,
      unusedMagicLinks: 2,
    });
  });

  it("falls back to 0 for any count that comes back empty", async () => {
    mocks.fetchAll
      .mockResolvedValueOnce({ resources: [] })
      .mockResolvedValueOnce({ resources: [] })
      .mockResolvedValueOnce({ resources: [] });

    expect(await getDetailedCounts()).toEqual({
      expiredSessions: 0,
      usedMagicLinks: 0,
      unusedMagicLinks: 0,
    });
  });
});
