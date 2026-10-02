import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isPro: vi.fn(),
  markOnboardingStepComplete: vi.fn(),
  getBikesForUser: vi.fn(),
  getCarsForUser: vi.fn(),
  buildBikeComparison: vi.fn(),
  buildCarComparison: vi.fn(),
  getExchangeRates: vi.fn(),
}));

vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));
vi.mock("@/lib/tracker/userAccount", () => ({ markOnboardingStepComplete: mocks.markOnboardingStepComplete }));
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: mocks.getBikesForUser, isBikeReadOnly: (b: { transferredAt?: string }) => !!b.transferredAt }));
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: mocks.getCarsForUser, isCarReadOnly: (c: { transferredAt?: string }) => !!c.transferredAt }));
vi.mock("@/lib/tracker/bikeComparison", () => ({ buildBikeComparison: mocks.buildBikeComparison, MIN_COMPARE_BIKES: 2, MAX_COMPARE_BIKES: 4 }));
vi.mock("@/lib/tracker/carComparison", () => ({ buildCarComparison: mocks.buildCarComparison }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));

import { getAppComparison } from "@/lib/app/compareData";

const email = "rider@example.com";
const spend = { servicingTotal: 100, modsTotal: 0, billsTotal: 50, fuelTotal: 200, labourTotal: 0, grandTotal: 350 };

function entry(id: string, name: string, kind: "bike" | "car", costPerMile: number | null) {
  return {
    bikeId: id,
    kind,
    name,
    currentMileage: 10000,
    milesRidden: 2000,
    ownedSince: "2025-01-01",
    monthsOwned: 12,
    milesPerMonth: 166,
    spend,
    yearSpend: 300,
    costPerMile,
    actualMpg: null,
    serviceCount: 2,
    lastServiceDate: null,
    lastServiceMileage: null,
    nextDue: null,
    documentationPct: kind === "car" ? null : 50,
  };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.isPro.mockResolvedValue(true);
  mocks.markOnboardingStepComplete.mockResolvedValue(undefined);
  mocks.getExchangeRates.mockResolvedValue(null);
  mocks.getBikesForUser.mockResolvedValue([
    { id: "b1", make: "Yamaha", model: "MT-07", nickname: "Blue" },
    { id: "b2", make: "Honda", model: "CB500", transferredAt: "2026-01-01" },
  ]);
  mocks.getCarsForUser.mockResolvedValue([{ id: "c1", make: "BMW", model: "i4" }]);
  mocks.buildBikeComparison.mockResolvedValue([entry("b1", "Blue - Yamaha MT-07", "bike", 0.2)]);
  mocks.buildCarComparison.mockResolvedValue([entry("c1", "BMW i4", "car", 0.1)]);
});

describe("getAppComparison", () => {
  it("lists only vehicles still owned, without comparing anything when none are asked for", async () => {
    const data = await getAppComparison(email, []);
    expect(data.vehicles).toEqual([
      { kind: "bike", id: "b1", name: "Blue - Yamaha MT-07" },
      { kind: "car", id: "c1", name: "BMW i4" },
    ]);
    expect(data).toMatchObject({ isPro: true, min: 2, max: 4, comparison: null });
    expect(mocks.buildBikeComparison).not.toHaveBeenCalled();
  });

  it("compares a bike and a car in the order asked, with the cheaper one winning cost per mile", async () => {
    const data = await getAppComparison(email, ["c1", "b1"]);
    expect(data.comparison?.names).toEqual(["BMW i4", "Blue - Yamaha MT-07"]);
    expect(mocks.buildBikeComparison).toHaveBeenCalledWith(email, ["b1"]);
    expect(mocks.buildCarComparison).toHaveBeenCalledWith(email, ["c1"]);
    const costRow = data.comparison!.sections[0].rows[0];
    expect(costRow.label).toContain("Cost per mile");
    expect(costRow.winnerIndex).toBe(0);
    expect(costRow.badge).toBe("Cheaper to run");
    expect(mocks.markOnboardingStepComplete).toHaveBeenCalledWith(email, "compared-vehicles");
  });

  it("never compares a transferred vehicle, someone else's id, or too few", async () => {
    const data = await getAppComparison(email, ["b1", "b2", "not-mine"]);
    expect(data.comparison).toBeNull();
    expect(mocks.buildBikeComparison).not.toHaveBeenCalled();
  });

  it("shows nothing to compare on a free account", async () => {
    mocks.isPro.mockResolvedValue(false);
    const data = await getAppComparison(email, ["b1", "c1"]);
    expect(data.isPro).toBe(false);
    expect(data.comparison).toBeNull();
    expect(mocks.buildBikeComparison).not.toHaveBeenCalled();
  });
});
