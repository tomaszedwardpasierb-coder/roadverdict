import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPro: vi.fn(),
  loadComparison: vi.fn(),
  callGeminiForJson: vi.fn(),
  getExchangeRates: vi.fn(),
  read: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/comparisonEntries", () => ({ loadComparison: mocks.loadComparison }));
vi.mock("@/lib/tracker/geminiJsonCall", () => ({ callGeminiForJson: mocks.callGeminiForJson }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: () => ({ read: mocks.read }), items: { upsert: mocks.upsert } }),
}));

import { buildComparisonFacts, getComparisonSummary } from "@/lib/tracker/comparisonSummary";

const email = "rider@example.com";

function entry(id: string, name: string, kind: "bike" | "car", over: Record<string, unknown> = {}) {
  return {
    bikeId: id,
    kind,
    name,
    currentMileage: 12000,
    milesRidden: 4000,
    ownedSince: "2025-01-01",
    monthsOwned: 20,
    milesPerMonth: 200,
    spend: { servicingTotal: 300, modsTotal: 100, billsTotal: 400, fuelTotal: 600, labourTotal: 0, grandTotal: 1400 },
    yearSpend: 500,
    costPerMile: 0.35,
    actualMpg: 55.2,
    serviceCount: 3,
    lastServiceDate: "2026-05-01",
    lastServiceMileage: 11000,
    nextDue: null,
    documentationPct: 80,
    ...over,
  };
}

const bike = entry("b1", "Blue - Yamaha MT-07", "bike");
const car = entry("c1", "BMW i4", "car", {
  milesRidden: 1000,
  costPerMile: 1.2,
  actualMpg: null,
  documentationPct: null,
  spend: { servicingTotal: 100, modsTotal: 0, billsTotal: 900, fuelTotal: 200, labourTotal: 0, grandTotal: 1200 },
});

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  process.env.GEMINI_API_KEY = "test-key";
  mocks.isPro.mockResolvedValue(true);
  mocks.getExchangeRates.mockResolvedValue(null);
  mocks.loadComparison.mockResolvedValue({ vehicles: [], ids: ["b1", "c1"], entries: [bike, car], currency: "GBP", distanceUnit: "mi" });
  mocks.read.mockResolvedValue({ resource: undefined });
  mocks.upsert.mockResolvedValue({});
  mocks.callGeminiForJson.mockResolvedValue({ summary: "The MT-07 is far cheaper per mile.", points: ["The i4 is mostly fixed bills."] });
});

describe("buildComparisonFacts", () => {
  const facts = buildComparisonFacts({ entries: [bike, car] as never, currency: "GBP", rates: null, distanceUnit: "mi", period: null });

  it("gives each vehicle's figures, already formatted", () => {
    expect(facts).toContain("VEHICLE 1: Blue - Yamaha MT-07 (motorcycle)");
    expect(facts).toContain("VEHICLE 2: BMW i4 (car)");
    expect(facts).toContain("Cost per mile: £0.35/mi");
    expect(facts).toContain("Real fuel economy: 55.2 mpg");
    expect(facts).toContain("not enough full-tank fill-ups logged");
    expect(facts).toContain("not tracked for cars yet");
  });

  it("works out the fixed-bill share and the cross-vehicle comparisons itself", () => {
    expect(facts).toContain("fixed bills (insurance/tax/MOT/finance - paid however little it's used): 75%");
    expect(facts).toContain("Fixed bills alone per mile: £0.90/mi");
    expect(facts).toContain("Most used: Blue - Yamaha MT-07 - 4.0 times the distance of the least used, BMW i4");
    expect(facts).toContain("Blue - Yamaha MT-07 costs you 71% less per mile than BMW i4.");
    expect(facts).toContain("Best real fuel economy: can't say");
  });
});

describe("getComparisonSummary", () => {
  it("is Pro only", async () => {
    mocks.isPro.mockResolvedValue(false);
    expect(await getComparisonSummary(email, ["b1", "c1"], null, true)).toEqual({ ok: false, reason: "not_pro" });
    expect(mocks.loadComparison).not.toHaveBeenCalled();
  });

  it("refuses fewer than two of the account's own vehicles", async () => {
    mocks.loadComparison.mockResolvedValue({ vehicles: [], ids: ["b1"], entries: [], currency: "GBP", distanceUnit: "mi" });
    expect(await getComparisonSummary(email, ["b1", "someone-elses"], null, true)).toEqual({ ok: false, reason: "invalid" });
    expect(mocks.callGeminiForJson).not.toHaveBeenCalled();
  });

  it("never calls the AI when only checking for a saved summary", async () => {
    expect(await getComparisonSummary(email, ["b1", "c1"], null, false)).toEqual({ ok: true, summary: null });
    expect(mocks.callGeminiForJson).not.toHaveBeenCalled();
  });

  it("writes and saves one when asked", async () => {
    const result = await getComparisonSummary(email, ["b1", "c1"], null, true);
    expect(result).toMatchObject({ ok: true, summary: { summary: "The MT-07 is far cheaper per mile.", points: ["The i4 is mostly fixed bills."] } });
    expect(mocks.callGeminiForJson.mock.calls[0][4]).toBe("comparisonSummary");
    const saved = mocks.upsert.mock.calls[0][0];
    expect(saved).toMatchObject({ pk: email, type: "comparisonSummary", summary: "The MT-07 is far cheaper per mile." });
    expect(saved.id).toMatch(/^comparisonSummary::/);
  });

  it("reuses a saved summary while the figures are unchanged, and offers a new one once they change", async () => {
    await getComparisonSummary(email, ["b1", "c1"], null, true);
    const saved = mocks.upsert.mock.calls[0][0];
    mocks.callGeminiForJson.mockClear();

    mocks.read.mockResolvedValue({ resource: saved });
    const again = await getComparisonSummary(email, ["b1", "c1"], null, true);
    expect(again).toMatchObject({ ok: true, summary: { summary: saved.summary } });
    expect(mocks.callGeminiForJson).not.toHaveBeenCalled();

    mocks.loadComparison.mockResolvedValue({ vehicles: [], ids: ["b1", "c1"], entries: [{ ...bike, milesRidden: 4100 }, car], currency: "GBP", distanceUnit: "mi" });
    expect(await getComparisonSummary(email, ["b1", "c1"], null, false)).toEqual({ ok: true, summary: null });
  });

  it("saves one per set of vehicles, whatever order they were picked in", async () => {
    await getComparisonSummary(email, ["b1", "c1"], null, true);
    mocks.loadComparison.mockResolvedValue({ vehicles: [], ids: ["c1", "b1"], entries: [car, bike], currency: "GBP", distanceUnit: "mi" });
    await getComparisonSummary(email, ["c1", "b1"], null, true);
    expect(mocks.upsert.mock.calls[0][0].id).toBe(mocks.upsert.mock.calls[1][0].id);
  });

  it("reports a failure when the AI doesn't answer", async () => {
    mocks.callGeminiForJson.mockResolvedValue(null);
    expect(await getComparisonSummary(email, ["b1", "c1"], null, true)).toEqual({ ok: false, reason: "failed" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
