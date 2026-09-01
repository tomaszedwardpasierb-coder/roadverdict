import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ClientSecretCredential: vi.fn(),
  getToken: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@azure/identity", () => ({
  ClientSecretCredential: mocks.ClientSecretCredential,
}));

vi.stubGlobal("fetch", mocks.fetch);

function logsTable(rows: any[][]): { tables: any[] } {
  return { tables: [{ name: "PrimaryResult", columns: [], rows }] };
}

function fetchOk(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.resetModules();
  mocks.ClientSecretCredential.mockReset();
  mocks.getToken.mockReset();
  mocks.fetch.mockReset();

  mocks.ClientSecretCredential.mockImplementation(function () {
    return { getToken: mocks.getToken };
  });
  mocks.getToken.mockResolvedValue({ token: "fake-token" });
  // Default: overall / byRoute / exceptions / trend queries, in the order getSiteStats fires them.
  mocks.fetch
    .mockResolvedValueOnce(fetchOk(logsTable([[100, 5, 250]])))
    .mockResolvedValueOnce(fetchOk(logsTable([["/api/verdict", 60, 3, 300]])))
    .mockResolvedValueOnce(fetchOk(logsTable([["Error", "boom", 4]])))
    .mockResolvedValueOnce(fetchOk(logsTable([["2026-09-01T00:00:00Z", 10, 1, 200]])));

  process.env.AZURE_TENANT_ID = "tenant-id";
  process.env.AZURE_CLIENT_ID = "client-id";
  process.env.AZURE_CLIENT_SECRET = "client-secret";
});

describe("getSiteStats", () => {
  it("authenticates with ClientSecretCredential using the configured env vars", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats();
    expect(mocks.ClientSecretCredential).toHaveBeenCalledWith("tenant-id", "client-id", "client-secret");
  });

  it("reuses the same credential across queries within one call (constructed once)", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats();
    expect(mocks.ClientSecretCredential).toHaveBeenCalledOnce();
    expect(mocks.getToken).toHaveBeenCalledTimes(4);
  });

  it("requests a Log Analytics scoped token", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats();
    expect(mocks.getToken).toHaveBeenCalledWith("https://api.loganalytics.io/.default");
  });

  it("sends the bearer token and the requested timespan to the query API", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats(24);
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(url).toContain("/query");
    expect(init.headers.Authorization).toBe("Bearer fake-token");
    const body = JSON.parse(init.body);
    expect(body.timespan).toBe("PT24H");
  });

  it("throws when no access token can be acquired", async () => {
    mocks.getToken.mockResolvedValue(null);
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await expect(getSiteStats()).rejects.toThrow("Failed to acquire Log Analytics access token.");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("throws using the API's error message when the query request is not ok", async () => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: { message: "workspace not found" } }),
    });
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await expect(getSiteStats()).rejects.toThrow("Log Analytics query failed: workspace not found");
  });

  it("falls back to the HTTP status when the API gives no error message", async () => {
    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) });
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await expect(getSiteStats()).rejects.toThrow("Log Analytics query failed: HTTP 503");
  });

  it("computes overall totals, failure rate, and average response time", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    const stats = await getSiteStats();
    expect(stats.totalRequests).toBe(100);
    expect(stats.failedRequests).toBe(5);
    expect(stats.failureRatePct).toBe(5);
    expect(stats.avgResponseTimeMs).toBe(250);
  });

  it("returns zero failure rate (not NaN) when there are no requests at all", async () => {
    mocks.fetch.mockReset();
    mocks.fetch
      .mockResolvedValueOnce(fetchOk(logsTable([[0, 0, 0]])))
      .mockResolvedValueOnce(fetchOk(logsTable([])))
      .mockResolvedValueOnce(fetchOk(logsTable([])))
      .mockResolvedValueOnce(fetchOk(logsTable([])));
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    const stats = await getSiteStats();
    expect(stats.totalRequests).toBe(0);
    expect(stats.failureRatePct).toBe(0);
  });

  it("maps the byRoute rows, computing a per-route failure rate", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    const stats = await getSiteStats();
    expect(stats.byRoute).toEqual([
      { route: "/api/verdict", requests: 60, failures: 3, failureRatePct: 5, avgDurationMs: 300 },
    ]);
  });

  it("maps top exceptions", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    const stats = await getSiteStats();
    expect(stats.topExceptions).toEqual([{ type: "Error", message: "boom", count: 4 }]);
  });

  it("maps the trend series", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    const stats = await getSiteStats();
    expect(stats.trend).toEqual([
      { bucket: "2026-09-01T00:00:00Z", requests: 10, failures: 1, avgMs: 200 },
    ]);
  });

  it("echoes back the requested windowHours", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    const stats = await getSiteStats(6);
    expect(stats.windowHours).toBe(6);
  });

  it("uses a 5-minute bucket for a 1 hour window", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats(1);
    const trendQueryBody = JSON.parse(mocks.fetch.mock.calls[3][1].body);
    expect(trendQueryBody.query).toContain("bin(timestamp, 5m)");
  });

  it("uses a 1 hour bucket for a 24 hour window", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats(24);
    const trendQueryBody = JSON.parse(mocks.fetch.mock.calls[3][1].body);
    expect(trendQueryBody.query).toContain("bin(timestamp, 1h)");
  });

  it("uses a 1 day bucket for a window longer than 24 hours", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats(168);
    const trendQueryBody = JSON.parse(mocks.fetch.mock.calls[3][1].body);
    expect(trendQueryBody.query).toContain("bin(timestamp, 1d)");
  });

  it("treats a successful HTTP response with a 4xx/5xx resultCode as a failure (not the requests table's own success column)", async () => {
    const { getSiteStats } = await import("@/lib/monitoring/appInsights");
    await getSiteStats();
    const overallQueryBody = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(overallQueryBody.query).toContain("toint(resultCode)");
    expect(overallQueryBody.query).not.toContain("success ==");
  });
});
