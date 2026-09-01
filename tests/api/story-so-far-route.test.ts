import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryBike: vi.fn(),
  updateBikeStoryCache: vi.fn(),
  getFuelLogs: vi.fn(),
  getServiceRecords: vi.fn(),
  getSellerReportCore: vi.fn(),
  computeBikeIdentity: vi.fn(),
  computeCategorySpend: vi.fn(),
  computeServiceRhythm: vi.fn(),
  computeMpgTrend: vi.fn(),
  generateStoryProse: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/bike", () => ({
  getPrimaryBike: mocks.getPrimaryBike,
  updateBikeStoryCache: mocks.updateBikeStoryCache,
}));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportCore: mocks.getSellerReportCore }));
vi.mock("@/lib/tracker/storyFacts", () => ({
  computeBikeIdentity: mocks.computeBikeIdentity,
  computeCategorySpend: mocks.computeCategorySpend,
  computeServiceRhythm: mocks.computeServiceRhythm,
  computeMpgTrend: mocks.computeMpgTrend,
}));
vi.mock("@/lib/tracker/storyProse", () => ({ generateStoryProse: mocks.generateStoryProse }));

import { GET } from "@/app/api/tracker/story-so-far/route";

const email = "rider@example.com";

const coreMock = {
  rows: [{ id: "sr-1" }],
  verdict: "good" as const,
  unconfirmedFindings: ["Check chain"],
  upcomingReminders: [],
  storyParagraphs: ["The bike has been well maintained."],
};

const bikeBase = {
  id: "bike-1",
  make: "Yamaha",
  model: "MT-07",
  storyCache: null,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email });
  mocks.getPrimaryBike.mockResolvedValue(bikeBase);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getSellerReportCore.mockResolvedValue(coreMock);
  mocks.computeBikeIdentity.mockReturnValue({ make: "Yamaha", model: "MT-07", year: 2020 });
  mocks.computeCategorySpend.mockReturnValue([]);
  mocks.computeServiceRhythm.mockReturnValue({ avgDaysBetweenServices: null });
  mocks.computeMpgTrend.mockReturnValue({ trend: null });
  mocks.generateStoryProse.mockResolvedValue(null);
  mocks.updateBikeStoryCache.mockResolvedValue(undefined);
  // Remove GEMINI_API_KEY from env so LLM path is skipped by default
  delete process.env.GEMINI_API_KEY;
});

describe("GET /api/tracker/story-so-far", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no bike", async () => {
    mocks.getPrimaryBike.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("returns a cached story verbatim when it exists and is still within the cooldown window", async () => {
    const cachedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(); // 1 day ago (within 7-day window)
    const cachedResponse = {
      generatedWithAi: true,
      sharedStory: ["Cached story paragraph."],
      ownerNotes: [],
      verdict: "good",
      identity: { make: "Yamaha" },
      categorySpend: [],
    };
    mocks.getPrimaryBike.mockResolvedValue({
      ...bikeBase,
      storyCache: { generatedAt: cachedAt, response: cachedResponse },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cached).toBe(true);
    expect(body.sharedStory).toEqual(cachedResponse.sharedStory);
    // Gemini must NOT have been called
    expect(mocks.generateStoryProse).not.toHaveBeenCalled();
    expect(mocks.getSellerReportCore).not.toHaveBeenCalled();
  });

  it("regenerates when the cached story is older than 7 days", async () => {
    const cachedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(); // 8 days ago
    mocks.getPrimaryBike.mockResolvedValue({
      ...bikeBase,
      storyCache: {
        generatedAt: cachedAt,
        response: { sharedStory: ["Stale story."] },
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cached).toBe(false);
    // Fresh generation should have consulted the real data sources
    expect(mocks.getSellerReportCore).toHaveBeenCalled();
  });

  it("returns the deterministic fallback story when GEMINI_API_KEY is absent", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.status).not.toBe(401);
    expect(body.sharedStory).toEqual(coreMock.storyParagraphs);
    expect(body.ownerNotes).toEqual(coreMock.unconfirmedFindings);
    expect(body.generatedWithAi).toBe(false);
  });

  it("uses AI prose when generateStoryProse returns content", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateStoryProse.mockResolvedValue({
      sharedStory: ["AI-written paragraph."],
      ownerNotes: ["AI note."],
    });

    const response = await GET();
    const body = await response.json();
    expect(body.generatedWithAi).toBe(true);
    expect(body.sharedStory).toEqual(["AI-written paragraph."]);
    expect(body.ownerNotes).toEqual(["AI note."]);
  });

  it("falls back to deterministic story when generateStoryProse returns null despite key being set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateStoryProse.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();
    expect(body.generatedWithAi).toBe(false);
    expect(body.sharedStory).toEqual(coreMock.storyParagraphs);
  });

  it("always saves the new story to cache after a fresh generation", async () => {
    await GET();
    expect(mocks.updateBikeStoryCache).toHaveBeenCalledWith(
      email,
      "bike-1",
      expect.objectContaining({
        generatedAt: expect.any(String),
        response: expect.objectContaining({ sharedStory: expect.any(Array) }),
      })
    );
  });

  it("does not call updateBikeStoryCache when serving from cache", async () => {
    const cachedAt = new Date(Date.now() - 60 * 1000).toISOString(); // 1 minute ago
    mocks.getPrimaryBike.mockResolvedValue({
      ...bikeBase,
      storyCache: { generatedAt: cachedAt, response: { sharedStory: ["cached"] } },
    });

    await GET();
    expect(mocks.updateBikeStoryCache).not.toHaveBeenCalled();
  });

  it("includes cached:false and a nextAvailableAt timestamp on a fresh response", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.cached).toBe(false);
    expect(typeof body.nextAvailableAt).toBe("string");
    // nextAvailableAt should be roughly 7 days from now
    const diff = new Date(body.nextAvailableAt).getTime() - Date.now();
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it("includes a nextAvailableAt timestamp on a cached response too", async () => {
    const cachedAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mocks.getPrimaryBike.mockResolvedValue({
      ...bikeBase,
      storyCache: { generatedAt: cachedAt, response: { sharedStory: [], verdict: "good", identity: {}, categorySpend: [] } },
    });

    const response = await GET();
    const body = await response.json();
    expect(typeof body.nextAvailableAt).toBe("string");
  });

  it("includes verdict, identity and categorySpend on a fresh response", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.verdict).toBe(coreMock.verdict);
    expect(body.identity).toBeDefined();
    expect(body.categorySpend).toBeDefined();
  });
});
