// Mirrors story-so-far-route.test.ts for the car equivalent route.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getPrimaryCar: vi.fn(),
  updateCarStoryCache: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarSellerReportCore: vi.fn(),
  computeCarIdentity: vi.fn(),
  computeCategorySpend: vi.fn(),
  computeServiceRhythm: vi.fn(),
  computeMpgTrend: vi.fn(),
  generateCarStoryProse: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/car", () => ({
  getPrimaryCar: mocks.getPrimaryCar,
  updateCarStoryCache: mocks.updateCarStoryCache,
}));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carSellerReportData", () => ({ getCarSellerReportCore: mocks.getCarSellerReportCore }));
vi.mock("@/lib/tracker/carStoryFacts", () => ({ computeCarIdentity: mocks.computeCarIdentity }));
vi.mock("@/lib/tracker/storyFacts", () => ({
  computeCategorySpend: mocks.computeCategorySpend,
  computeServiceRhythm: mocks.computeServiceRhythm,
  computeMpgTrend: mocks.computeMpgTrend,
}));
vi.mock("@/lib/tracker/carStoryProse", () => ({ generateCarStoryProse: mocks.generateCarStoryProse }));

import { GET } from "@/app/api/cars/car-story-so-far/route";

const email = "owner@example.com";

const coreMock = {
  rows: [{ id: "sr-1" }],
  verdict: "good" as const,
  unconfirmedFindings: ["Check cambelt"],
  upcomingReminders: [],
  storyParagraphs: ["The car has been well maintained."],
};

const carBase = {
  id: "car-1",
  make: "Ford",
  model: "Focus",
  storyCache: null,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email });
  mocks.getPrimaryCar.mockResolvedValue(carBase);
  mocks.getCarFuelLogs.mockResolvedValue([]);
  mocks.getCarServiceRecords.mockResolvedValue([]);
  mocks.getCarSellerReportCore.mockResolvedValue(coreMock);
  mocks.computeCarIdentity.mockReturnValue({ make: "Ford", model: "Focus", year: 2020 });
  mocks.computeCategorySpend.mockReturnValue([]);
  mocks.computeServiceRhythm.mockReturnValue({ avgDaysBetweenServices: null });
  mocks.computeMpgTrend.mockReturnValue({ trend: null });
  mocks.generateCarStoryProse.mockResolvedValue(null);
  mocks.updateCarStoryCache.mockResolvedValue(undefined);
  delete process.env.GEMINI_API_KEY;
});

describe("GET /api/cars/car-story-so-far", () => {
  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns 404 when the account has no car", async () => {
    mocks.getPrimaryCar.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
  });

  it("returns a cached story verbatim when it exists and is still within the cooldown window", async () => {
    const cachedAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    const cachedResponse = {
      generatedWithAi: true,
      sharedStory: ["Cached story paragraph."],
      ownerNotes: [],
      verdict: "good",
      identity: { make: "Ford" },
      categorySpend: [],
    };
    mocks.getPrimaryCar.mockResolvedValue({
      ...carBase,
      storyCache: { generatedAt: cachedAt, response: cachedResponse },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cached).toBe(true);
    expect(body.sharedStory).toEqual(cachedResponse.sharedStory);
    expect(mocks.generateCarStoryProse).not.toHaveBeenCalled();
    expect(mocks.getCarSellerReportCore).not.toHaveBeenCalled();
  });

  it("regenerates when the cached story is older than 7 days", async () => {
    const cachedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    mocks.getPrimaryCar.mockResolvedValue({
      ...carBase,
      storyCache: {
        generatedAt: cachedAt,
        response: { sharedStory: ["Stale story."] },
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cached).toBe(false);
    expect(mocks.getCarSellerReportCore).toHaveBeenCalled();
  });

  it("returns the deterministic fallback story when GEMINI_API_KEY is absent", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.sharedStory).toEqual(coreMock.storyParagraphs);
    expect(body.ownerNotes).toEqual(coreMock.unconfirmedFindings);
    expect(body.generatedWithAi).toBe(false);
  });

  it("uses AI prose when generateCarStoryProse returns content", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateCarStoryProse.mockResolvedValue({
      sharedStory: ["AI-written paragraph."],
      ownerNotes: ["AI note."],
    });

    const response = await GET();
    const body = await response.json();
    expect(body.generatedWithAi).toBe(true);
    expect(body.sharedStory).toEqual(["AI-written paragraph."]);
    expect(body.ownerNotes).toEqual(["AI note."]);
  });

  it("falls back to deterministic story when generateCarStoryProse returns null despite key being set", async () => {
    process.env.GEMINI_API_KEY = "fake-key";
    mocks.generateCarStoryProse.mockResolvedValue(null);

    const response = await GET();
    const body = await response.json();
    expect(body.generatedWithAi).toBe(false);
    expect(body.sharedStory).toEqual(coreMock.storyParagraphs);
  });

  it("always saves the new story to cache after a fresh generation", async () => {
    await GET();
    expect(mocks.updateCarStoryCache).toHaveBeenCalledWith(
      email,
      "car-1",
      expect.objectContaining({
        generatedAt: expect.any(String),
        response: expect.objectContaining({ sharedStory: expect.any(Array) }),
      })
    );
  });

  it("does not call updateCarStoryCache when serving from cache", async () => {
    const cachedAt = new Date(Date.now() - 60 * 1000).toISOString();
    mocks.getPrimaryCar.mockResolvedValue({
      ...carBase,
      storyCache: { generatedAt: cachedAt, response: { sharedStory: ["cached"] } },
    });

    await GET();
    expect(mocks.updateCarStoryCache).not.toHaveBeenCalled();
  });

  it("includes cached:false and a nextAvailableAt timestamp on a fresh response", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.cached).toBe(false);
    expect(typeof body.nextAvailableAt).toBe("string");
    const diff = new Date(body.nextAvailableAt).getTime() - Date.now();
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it("only includes fuel logs with litres (excludes electric-only charging entries) when computing the MPG trend", async () => {
    mocks.getCarFuelLogs.mockResolvedValue([
      { id: "f1", mileage: 100, litres: 10, filledToFull: true, date: "2025-01-01", cost: 15 },
      { id: "f2", mileage: 200, kwh: 40, date: "2025-01-05", cost: 12 },
    ]);
    await GET();
    const [passedLogs] = mocks.computeMpgTrend.mock.calls[0];
    expect(passedLogs).toHaveLength(1);
    expect(passedLogs[0].id).toBe("f1");
  });

  it("includes verdict, identity and categorySpend on a fresh response", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.verdict).toBe(coreMock.verdict);
    expect(body.identity).toBeDefined();
    expect(body.categorySpend).toBeDefined();
  });
});
