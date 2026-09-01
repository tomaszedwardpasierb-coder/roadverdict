import { beforeAll, describe, expect, it } from "vitest";

// db.ts picks its SQLite file location based on WEBSITE_SITE_NAME: unset ->
// <cwd>/data (the real project folder), set -> os.tmpdir() (see the comment
// block at the top of src/lib/db.ts). Setting it here, before the module is
// ever imported, redirects this test run's database to a throwaway temp
// file instead of writing into the actual repo's data/ directory.
//
// This has to be a *dynamic* import inside beforeAll, not a static import
// above: static imports are evaluated before any of this file's own
// top-level statements run (see the equivalent APP_URL note in
// assistantKnowledge.test.ts), so setting the env var above a static
// `import ... from "@/lib/db"` would be too late.
process.env.WEBSITE_SITE_NAME = "unit-test-instance";

let db: typeof import("@/lib/db");

beforeAll(async () => {
  db = await import("@/lib/db");
});

// Real better-sqlite3 is exercised for real here (not mocked) - it's a
// local, synchronous, no-network embedded database, not a cloud boundary
// like Cosmos/Blob/Resend, so there's nothing worth mocking away. Each
// test below scopes its rows behind a fresh random jobType/bikeClass so
// runs don't interfere with each other or with rows left behind by
// previous test runs against the same (persistent, tmpdir-backed) file.
function unique(label: string): string {
  return `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

describe("logBuyingGuideCheck", () => {
  it("inserts a well-formed entry without throwing", () => {
    expect(() =>
      db.logBuyingGuideCheck({ bikeClass: "medium", brand: "honda", ageBand: "5-10" })
    ).not.toThrow();
  });

  it("throws when a required field is missing (NOT NULL column has no bound value)", () => {
    expect(() =>
      db.logBuyingGuideCheck({ bikeClass: "medium", brand: "honda" } as any)
    ).toThrow();
  });
});

describe("logQuoteCheck", () => {
  const baseEntry = {
    jobType: "service",
    bikeClass: "medium",
    brand: "honda",
    region: "london",
    quotedPrice: 150,
    verdict: "fair",
  };

  it("inserts a well-formed entry without throwing", () => {
    expect(() => db.logQuoteCheck(baseEntry)).not.toThrow();
  });

  it("throws when a required field is missing (NOT NULL column has no bound value)", () => {
    const { verdict, ...incomplete } = baseEntry;
    expect(() => db.logQuoteCheck(incomplete as any)).toThrow();
  });
});

describe("getCommunityStats", () => {
  it("returns null when fewer than 8 quotes are logged for the job/bike-class combination", () => {
    const jobType = unique("job-below-threshold");
    const bikeClass = unique("class-below-threshold");
    for (let i = 0; i < 7; i++) {
      db.logQuoteCheck({
        jobType,
        bikeClass,
        brand: "honda",
        region: "london",
        quotedPrice: 100 + i,
        verdict: "fair",
      });
    }
    expect(db.getCommunityStats(jobType, bikeClass)).toBeNull();
  });

  it("returns sampleSize plus 25th/75th percentile low/high once at least 8 quotes are logged", () => {
    const jobType = unique("job-at-threshold");
    const bikeClass = unique("class-at-threshold");
    // Inserted out of order on purpose, to exercise the ORDER BY in the query
    // rather than relying on insertion order happening to already be sorted.
    const prices = [100, 300, 150, 250, 200, 175, 225, 125];
    for (const price of prices) {
      db.logQuoteCheck({ jobType, bikeClass, brand: "honda", region: "london", quotedPrice: price, verdict: "fair" });
    }

    const stats = db.getCommunityStats(jobType, bikeClass);

    // sorted: [100,125,150,175,200,225,250,300]
    // p25 idx = 0.25*7 = 1.75 -> interpolate(125,150) = 143.75 -> round 144
    // p75 idx = 0.75*7 = 5.25 -> interpolate(225,250) = 231.25 -> round 231
    expect(stats).toEqual({ sampleSize: 8, low: 144, high: 231 });
  });

  it("only counts quotes matching both jobType and bikeClass, ignoring other buckets", () => {
    const jobType = unique("job-isolated");
    const bikeClass = unique("class-isolated");
    for (let i = 0; i < 8; i++) {
      db.logQuoteCheck({ jobType, bikeClass, brand: "honda", region: "london", quotedPrice: 200, verdict: "fair" });
    }
    // Same jobType, different bikeClass - must not be counted towards the bucket above.
    for (let i = 0; i < 8; i++) {
      db.logQuoteCheck({
        jobType,
        bikeClass: unique("other-class"),
        brand: "honda",
        region: "london",
        quotedPrice: 9999,
        verdict: "fair",
      });
    }
    const stats = db.getCommunityStats(jobType, bikeClass);
    expect(stats?.sampleSize).toBe(8);
    expect(stats?.low).toBe(200);
    expect(stats?.high).toBe(200);
  });
});
