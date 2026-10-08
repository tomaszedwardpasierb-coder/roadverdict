// Place at: tests/unit/quoteLogs.test.ts
//
// The anonymous Quote Checker / Buying Guide records: written only on the
// live Azure site, one small document each, never able to fail a request;
// community stats need 8+ quotes and come from the latest ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), query: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({ getContainer: () => ({ items: { create: mocks.create, query: mocks.query } }) }));

import {
  getCarCommunityStats,
  getCommunityStats,
  logBuyingGuideCheck,
  logCarBuyingGuideCheck,
  logCarQuoteCheck,
  logQuoteCheck,
} from "@/lib/quoteLogs";

function resultsOf(resources: number[]) {
  return { fetchAll: async () => ({ resources }) };
}

beforeEach(() => {
  mocks.create.mockReset();
  mocks.create.mockResolvedValue(undefined);
  mocks.query.mockReset();
  vi.stubEnv("WEBSITE_SITE_NAME", "roadverdict");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("writing logs", () => {
  it("stores a bike quote check in the bike quote partition, with no identifying field", async () => {
    await logQuoteCheck({ jobType: "full-service", bikeClass: "medium", brand: "yamaha", region: "london-se", quotedPrice: 240, verdict: "fair" });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const doc = mocks.create.mock.calls[0][0];
    expect(doc).toMatchObject({
      pk: "quoteLog::bike",
      type: "quoteLog",
      kind: "bike",
      jobType: "full-service",
      bikeClass: "medium",
      brand: "yamaha",
      region: "london-se",
      quotedPrice: 240,
      verdict: "fair",
    });
    expect(doc.id).toMatch(/^quoteLog::bike::/);
    expect(new Date(doc.createdAt).getTime()).not.toBeNaN();
    expect(Object.keys(doc).sort()).toEqual(["bikeClass", "brand", "createdAt", "id", "jobType", "kind", "pk", "quotedPrice", "region", "type", "verdict"]);
  });

  it("stores car quote checks and both buying-guide lookups in their own partitions", async () => {
    await logCarQuoteCheck({ jobType: "brake-pads", carClass: "small", brand: "ford", region: "scotland-ni", quotedPrice: 180, verdict: "high" });
    await logBuyingGuideCheck({ bikeClass: "large", brand: "bmw", ageBand: "5-10" });
    await logCarBuyingGuideCheck({ carClass: "family", brand: "vauxhall", ageBand: "10+" });
    expect(mocks.create.mock.calls.map((c) => [c[0].pk, c[0].type])).toEqual([
      ["quoteLog::car", "quoteLog"],
      ["buyingGuideLog::bike", "buyingGuideLog"],
      ["buyingGuideLog::car", "buyingGuideLog"],
    ]);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ carClass: "small", quotedPrice: 180 });
  });

  it("writes nothing when it isn't running on the live Azure site", async () => {
    vi.unstubAllEnvs();
    delete process.env.WEBSITE_SITE_NAME;
    await logQuoteCheck({ jobType: "tyres", bikeClass: "small", brand: "honda", region: "london-se", quotedPrice: 99, verdict: "fair" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never throws when the database fails", async () => {
    mocks.create.mockRejectedValue(new Error("cosmos down"));
    await expect(logQuoteCheck({ jobType: "tyres", bikeClass: "small", brand: "honda", region: "london-se", quotedPrice: 99, verdict: "fair" })).resolves.toBeUndefined();
  });
});

describe("community stats", () => {
  it("returns null below 8 quotes", async () => {
    mocks.query.mockReturnValue(resultsOf([100, 110, 120, 130, 140, 150, 160]));
    expect(await getCommunityStats("full-service", "medium")).toBeNull();
  });

  it("returns the 25th–75th percentile range once there are 8, whatever order they arrive in", async () => {
    mocks.query.mockReturnValue(resultsOf([107, 100, 105, 101, 106, 102, 104, 103]));
    expect(await getCommunityStats("full-service", "medium")).toEqual({ sampleSize: 8, low: 102, high: 105 });
  });

  it("asks only the bike partition, for this job and size, newest first and capped", async () => {
    mocks.query.mockReturnValue(resultsOf([]));
    await getCommunityStats("full-service", "medium");
    const [spec, options] = mocks.query.mock.calls[0];
    expect(options).toEqual({ partitionKey: "quoteLog::bike" });
    expect(spec.query).toContain("TOP 500");
    expect(spec.query).toContain("c.bikeClass = @classValue");
    expect(spec.query).toContain("ORDER BY c.createdAt DESC");
    expect(spec.parameters).toEqual([
      { name: "@jobType", value: "full-service" },
      { name: "@classValue", value: "medium" },
    ]);
  });

  it("uses the car partition and car size field for cars", async () => {
    mocks.query.mockReturnValue(resultsOf([200, 210, 220, 230, 240, 250, 260, 270, 280]));
    const stats = await getCarCommunityStats("interim-service", "small");
    expect(stats).toMatchObject({ sampleSize: 9 });
    const [spec, options] = mocks.query.mock.calls[0];
    expect(options).toEqual({ partitionKey: "quoteLog::car" });
    expect(spec.query).toContain("c.carClass = @classValue");
  });

  it("returns null instead of failing when the database does", async () => {
    mocks.query.mockImplementation(() => {
      throw new Error("cosmos down");
    });
    expect(await getCommunityStats("full-service", "medium")).toBeNull();
  });
});
