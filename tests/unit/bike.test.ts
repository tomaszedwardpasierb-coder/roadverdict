import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
  fetchAll: vi.fn(),
  cookieGet: vi.fn(),
  isPro: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: {
    upsert: mocks.upsert,
    // Forwards the query object and options through to mocks.fetchAll so
    // individual tests can differentiate behaviour by @type/@bikeId
    // parameters (deleteBike fires one query per record type) while
    // simpler call sites can just mockResolvedValue and ignore the args.
    query: vi.fn((queryObj: unknown, options: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj, options) })),
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.cookieGet })) }));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import {
  MAX_FREE_BIKES,
  generateBikeId,
  isBikeReadOnly,
  countActiveBikes,
  getCurrentRegistration,
  getBikesForUser,
  findBikeByRegistrationAcrossAccounts,
  pickActiveBike,
  getPrimaryBike,
  getBike,
  createBike,
  updateBikeMileage,
  updateBikeDvlaData,
  updateBikeRegion,
  updateBikeBudget,
  updateBikeStoryCache,
  updateBikeBuyerOpinionCache,
  updateBikeShareToken,
  updateBikeUnits,
  updateBikeCurrency,
  updateBikeIncludeInsuranceInReport,
  updateBikeIncludeFinanceInReport,
  setOriginalRegistration,
  addRegistrationChange,
  deleteBike,
  updateBikeChartType,
  type BikeDoc,
} from "@/lib/tracker/bike";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mockContainer.items.query.mockClear();
}

function makeBike(overrides: Partial<BikeDoc> = {}): BikeDoc {
  return {
    id: "owner@example.com::bike::1000::abc123",
    pk: "owner@example.com",
    type: "bike",
    make: "Honda",
    model: "CB500F",
    engineCC: 471,
    bikeClass: "naked" as any,
    currentMileage: 5000,
    startingMileage: 100,
    nickname: "The Beast",
    dateAdded: "2024-01-01",
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------

describe("generateBikeId", () => {
  it("embeds the owner's email as the leading segment", () => {
    expect(generateBikeId("owner@example.com")).toMatch(/^owner@example\.com::bike::\d+::[a-z0-9]+$/);
  });

  // The random suffix is the actual fix for the old `${email}::bike`
  // scheme silently overwriting a second bike via upsert - pin that two
  // ids generated back to back are never equal.
  it("produces a different id on every call, even generated back to back", () => {
    const first = generateBikeId("owner@example.com");
    const second = generateBikeId("owner@example.com");
    expect(first).not.toBe(second);
  });
});

describe("isBikeReadOnly", () => {
  it("is false for a bike with no transferredTo", () => {
    expect(isBikeReadOnly(makeBike())).toBe(false);
  });

  it("is true once transferredTo is set", () => {
    expect(
      isBikeReadOnly(
        makeBike({ transferredTo: { newBikeId: "b2", newOwnerEmail: "buyer@example.com", transferredAt: "2025-01-01" } })
      )
    ).toBe(true);
  });
});

describe("countActiveBikes", () => {
  it("counts every bike when none have been transferred", () => {
    expect(countActiveBikes([makeBike({ id: "a" }), makeBike({ id: "b" })])).toBe(2);
  });

  // The explicit guarantee in the source comment: a read-only, transferred
  // bike is historical record and must not count against the free-tier cap.
  it("excludes transferred (read-only) bikes from the count", () => {
    const bikes = [
      makeBike({ id: "a" }),
      makeBike({ id: "b", transferredTo: { newBikeId: "c", newOwnerEmail: "x@example.com", transferredAt: "2025-01-01" } }),
    ];
    expect(countActiveBikes(bikes)).toBe(1);
  });

  it("returns 0 for an empty list", () => {
    expect(countActiveBikes([])).toBe(0);
  });
});

describe("getCurrentRegistration", () => {
  it("returns the original registration when there's no history of changes", () => {
    expect(getCurrentRegistration(makeBike({ originalRegistration: "AB12 CDE" }))).toBe("AB12 CDE");
  });

  it("returns the most recent change, not the original, once the plate has changed", () => {
    const bike = makeBike({
      originalRegistration: "AB12 CDE",
      registrationChanges: [
        { plate: "XY99 ZZZ", reason: "private-plate-assigned", changedAt: "2024-06-01" },
        { plate: "MN01 ABC", reason: "correction", changedAt: "2024-09-01" },
      ],
    });
    expect(getCurrentRegistration(bike)).toBe("MN01 ABC");
  });

  it("returns undefined for a bike with no registration on record at all", () => {
    expect(getCurrentRegistration(makeBike({ originalRegistration: undefined }))).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// getBikesForUser
// ---------------------------------------------------------------------

describe("getBikesForUser", () => {
  beforeEach(resetAllMocks);

  it("queries the user's own partition, ordered oldest first, and returns the resources", async () => {
    const bikes = [makeBike({ id: "a" }), makeBike({ id: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: bikes });

    const result = await getBikesForUser("owner@example.com");

    expect(result).toEqual(bikes);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("ORDER BY c.dateAdded ASC");
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });

  it("returns an empty list when the user has no bikes", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getBikesForUser("owner@example.com")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// findBikeByRegistrationAcrossAccounts
// ---------------------------------------------------------------------

describe("findBikeByRegistrationAcrossAccounts", () => {
  beforeEach(resetAllMocks);

  it("returns null without querying when the registration normalizes to empty", async () => {
    expect(await findBikeByRegistrationAcrossAccounts("   ")).toBeNull();
    expect(mockContainer.items.query).not.toHaveBeenCalled();
  });

  it("normalizes the registration to uppercase with no spaces before querying", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await findBikeByRegistrationAcrossAccounts("ab12 cde");
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@reg", value: "AB12CDE" }]);
  });

  it("returns null when no bike anywhere carries that plate", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await findBikeByRegistrationAcrossAccounts("AB12CDE")).toBeNull();
  });

  it("returns the single match's owner and bike id", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "bike-1", pk: "owner@example.com", transferredTo: undefined }] });
    expect(await findBikeByRegistrationAcrossAccounts("AB12CDE")).toEqual({
      ownerEmail: "owner@example.com",
      bikeId: "bike-1",
    });
  });

  // Explicit guarantee from the source comment: prefer the live head of
  // the chain over a historical, already-transferred document sharing
  // the same registration - regardless of which one comes back first.
  it("prefers the currently-active match over an already-transferred historical one", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { id: "old-bike", pk: "seller@example.com", transferredTo: { newBikeId: "new-bike" } },
        { id: "new-bike", pk: "buyer@example.com", transferredTo: undefined },
      ],
    });
    expect(await findBikeByRegistrationAcrossAccounts("AB12CDE")).toEqual({
      ownerEmail: "buyer@example.com",
      bikeId: "new-bike",
    });
  });

  it("falls back to the first match when every match is historical (already transferred)", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [{ id: "old-bike", pk: "seller@example.com", transferredTo: { newBikeId: "new-bike" } }],
    });
    expect(await findBikeByRegistrationAcrossAccounts("AB12CDE")).toEqual({
      ownerEmail: "seller@example.com",
      bikeId: "old-bike",
    });
  });
});

// ---------------------------------------------------------------------
// pickActiveBike
// ---------------------------------------------------------------------

describe("pickActiveBike", () => {
  beforeEach(resetAllMocks);

  it("returns null for an empty list without ever reading the cookie", async () => {
    expect(await pickActiveBike([])).toBeNull();
    expect(mocks.cookieGet).not.toHaveBeenCalled();
  });

  it("falls back to the first (oldest) bike when no active-bike cookie is set", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const bikes = [makeBike({ id: "a" }), makeBike({ id: "b" })];
    expect(await pickActiveBike(bikes)).toBe(bikes[0]);
  });

  it("returns the bike the cookie points to, even when it isn't the first one", async () => {
    mocks.cookieGet.mockReturnValue({ value: "b" });
    const bikes = [makeBike({ id: "a" }), makeBike({ id: "b" })];
    expect(await pickActiveBike(bikes)).toBe(bikes[1]);
  });

  // Explicit case from the source comment: a cookie pointing at a bike
  // not in this list (stale after switching accounts) must not throw or
  // resolve to nothing - it falls back to the first bike.
  it("falls back to the first bike when the cookie references a bike not in the list", async () => {
    mocks.cookieGet.mockReturnValue({ value: "does-not-exist" });
    const bikes = [makeBike({ id: "a" }), makeBike({ id: "b" })];
    expect(await pickActiveBike(bikes)).toBe(bikes[0]);
  });
});

// ---------------------------------------------------------------------
// getPrimaryBike
// ---------------------------------------------------------------------

describe("getPrimaryBike", () => {
  beforeEach(resetAllMocks);

  it("returns null when the user has no bikes at all", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getPrimaryBike("owner@example.com")).toBeNull();
  });

  it("resolves the oldest bike when no switcher cookie is set", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const bikes = [makeBike({ id: "a" }), makeBike({ id: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: bikes });
    expect(await getPrimaryBike("owner@example.com")).toStrictEqual(bikes[0]);
  });

  it("resolves whichever bike the switcher cookie names", async () => {
    mocks.cookieGet.mockReturnValue({ value: "b" });
    const bikes = [makeBike({ id: "a" }), makeBike({ id: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: bikes });
    expect(await getPrimaryBike("owner@example.com")).toStrictEqual(bikes[1]);
  });
});

// ---------------------------------------------------------------------
// getBike
// ---------------------------------------------------------------------

describe("getBike", () => {
  beforeEach(resetAllMocks);

  it("returns the bike when it exists", async () => {
    const bike = makeBike();
    mocks.read.mockResolvedValue({ resource: bike });
    expect(await getBike("owner@example.com", bike.id)).toEqual(bike);
  });

  it("returns null when no document exists at that id", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getBike("owner@example.com", "missing")).toBeNull();
  });

  it("fails soft to null if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    });
    expect(await getBike("owner@example.com", "bike-1")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// createBike
// ---------------------------------------------------------------------

describe("createBike", () => {
  const newBikeData = {
    make: "Yamaha",
    model: "MT-07",
    engineCC: 689,
    bikeClass: "naked" as any,
    registration: "AB12 CDE",
    currentMileage: 1200,
    nickname: "MT",
    region: "uk" as any,
  };

  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("blocks creation once the active-bike free-tier cap is reached", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [makeBike({ id: "a" }), makeBike({ id: "b" })] });

    const result = await createBike("owner@example.com", newBikeData);

    expect(result).toEqual({ ok: false, reason: "limit_reached", limit: MAX_FREE_BIKES });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  // Pro accounts skip the cap entirely, per subscriptions.ts's isPro()
  // (temporarily true for everyone while no payment platform is wired
  // in - see that file's own comment).
  it("lets a Pro account create a bike past the free-tier cap", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [makeBike({ id: "a" }), makeBike({ id: "b" })] });
    mocks.isPro.mockResolvedValue(true);

    const result = await createBike("owner@example.com", newBikeData);

    expect(result.ok).toBe(true);
    expect(mocks.upsert).toHaveBeenCalled();
  });

  // Mirrors countActiveBikes: a transferred (read-only) bike must not
  // count against the cap, so one active + one transferred still allows
  // a new bike to be created.
  it("does not count a transferred bike toward the free-tier cap", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        makeBike({ id: "a" }),
        makeBike({ id: "b", transferredTo: { newBikeId: "c", newOwnerEmail: "x@example.com", transferredAt: "2025-01-01" } }),
      ],
    });

    const result = await createBike("owner@example.com", newBikeData);

    expect(result.ok).toBe(true);
  });

  it("creates the bike when under the cap, with startingMileage pinned to the initial currentMileage", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });

    const result = await createBike("owner@example.com", newBikeData);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bike).toMatchObject({
      pk: "owner@example.com",
      type: "bike",
      make: "Yamaha",
      model: "MT-07",
      originalRegistration: "AB12 CDE",
      currentMileage: 1200,
      startingMileage: 1200,
      nickname: "MT",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(result.bike);
  });

  it("passes optional fields (year, isCustomBuild, mayHavePriorHistory) through when supplied", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });

    const result = await createBike("owner@example.com", { ...newBikeData, year: 2019, isCustomBuild: true, mayHavePriorHistory: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok result");
    expect(result.bike.year).toBe(2019);
    expect(result.bike.isCustomBuild).toBe(true);
    expect(result.bike.mayHavePriorHistory).toBe(true);
  });
});

// ---------------------------------------------------------------------
// updateBikeMileage
// ---------------------------------------------------------------------

describe("updateBikeMileage", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeMileage("owner@example.com", "missing", 999)).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("updates currentMileage and upserts the changed document", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ currentMileage: 5000 }) });
    const result = await updateBikeMileage("owner@example.com", "bike-1", 5500);
    expect(result?.currentMileage).toBe(5500);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ currentMileage: 5500 }));
  });
});

// ---------------------------------------------------------------------
// updateBikeDvlaData
// ---------------------------------------------------------------------

describe("updateBikeDvlaData", () => {
  const dvlaBase = {
    fetchedAt: "2025-01-01T00:00:00.000Z",
    keeperChangeList: [],
    plateChangeList: [],
    v5cIssueDates: [],
  };

  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeDvlaData("owner@example.com", "missing", { ...dvlaBase })).toBeNull();
  });

  it("auto-fills tankCapacityLitres when the bike doesn't have one set", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ tankCapacityLitres: undefined }) });
    const result = await updateBikeDvlaData("owner@example.com", "bike-1", { ...dvlaBase, fuelTankCapacityLitres: 17 });
    expect(result?.tankCapacityLitres).toBe(17);
  });

  // Explicit guarantee from the source comment: never overwrite a value
  // an owner may have already entered themselves.
  it("never overwrites a tankCapacityLitres the owner already entered", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ tankCapacityLitres: 20 }) });
    const result = await updateBikeDvlaData("owner@example.com", "bike-1", { ...dvlaBase, fuelTankCapacityLitres: 17 });
    expect(result?.tankCapacityLitres).toBe(20);
  });

  it("leaves tankCapacityLitres unset when DVLA data has no tank figure at all", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ tankCapacityLitres: undefined }) });
    const result = await updateBikeDvlaData("owner@example.com", "bike-1", { ...dvlaBase });
    expect(result?.tankCapacityLitres).toBeUndefined();
  });

  it("always stores the dvlaData snapshot itself regardless of the tank auto-fill outcome", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ tankCapacityLitres: 20 }) });
    const data = { ...dvlaBase, fuelTankCapacityLitres: 17, officialCombinedMpg: 55 };
    const result = await updateBikeDvlaData("owner@example.com", "bike-1", data);
    expect(result?.dvlaData).toEqual(data);
  });
});

// ---------------------------------------------------------------------
// The simple single-field update functions all share one pattern:
// not-found -> null (no upsert); found -> field set + upsert.
// ---------------------------------------------------------------------

describe("simple single-field bike updates", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  const cases: Array<{
    name: string;
    call: () => Promise<BikeDoc | null>;
    field: keyof BikeDoc;
    expected: unknown;
  }> = [
    { name: "updateBikeRegion", call: () => updateBikeRegion("owner@example.com", "bike-1", "uk" as any), field: "region", expected: "uk" },
    { name: "updateBikeBudget", call: () => updateBikeBudget("owner@example.com", "bike-1", 1200), field: "annualBudget", expected: 1200 },
    {
      name: "updateBikeStoryCache",
      call: () =>
        updateBikeStoryCache("owner@example.com", "bike-1", {
          generatedAt: "2025-01-01T00:00:00.000Z",
          response: { generatedWithAi: true, sharedStory: [], ownerNotes: [], verdict: { tier: "good", label: "Good", reasons: [] }, identity: {} as any, categorySpend: [] },
        }),
      field: "storyCache",
      expected: expect.objectContaining({ generatedAt: "2025-01-01T00:00:00.000Z" }),
    },
    {
      name: "updateBikeBuyerOpinionCache",
      call: () =>
        updateBikeBuyerOpinionCache("owner@example.com", "bike-1", {
          generatedAt: "2025-01-01T00:00:00.000Z",
          response: { strengths: [], concerns: [], honestRead: "Solid bike." },
        }),
      field: "buyerOpinionCache",
      expected: expect.objectContaining({ generatedAt: "2025-01-01T00:00:00.000Z" }),
    },
    { name: "updateBikeShareToken", call: () => updateBikeShareToken("owner@example.com", "bike-1", "tok_abc123"), field: "shareToken", expected: "tok_abc123" },
  ];

  it.each(cases)("$name returns null and does not upsert when the bike doesn't exist", async ({ call }) => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await call()).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(cases)("$name sets its field and upserts the changed document", async ({ call, field, expected }) => {
    mocks.read.mockResolvedValue({ resource: makeBike() });
    const result = await call();
    expect((result as any)?.[field]).toEqual(expected);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// updateBikeUnits - partial update, only touches fields actually supplied
// ---------------------------------------------------------------------

describe("updateBikeUnits", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeUnits("owner@example.com", "missing", "km" as any)).toBeNull();
  });

  it("updates only distanceUnit when fuelEconomyUnit isn't supplied", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ distanceUnit: "miles" as any, fuelEconomyUnit: "mpg" as any }) });
    const result = await updateBikeUnits("owner@example.com", "bike-1", "km" as any);
    expect(result?.distanceUnit).toBe("km");
    expect(result?.fuelEconomyUnit).toBe("mpg");
  });

  it("updates only fuelEconomyUnit when distanceUnit isn't supplied", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ distanceUnit: "miles" as any, fuelEconomyUnit: "mpg" as any }) });
    const result = await updateBikeUnits("owner@example.com", "bike-1", undefined, "l/100km" as any);
    expect(result?.distanceUnit).toBe("miles");
    expect(result?.fuelEconomyUnit).toBe("l/100km");
  });

  it("updates both when both are supplied", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ distanceUnit: "miles" as any, fuelEconomyUnit: "mpg" as any }) });
    const result = await updateBikeUnits("owner@example.com", "bike-1", "km" as any, "l/100km" as any);
    expect(result?.distanceUnit).toBe("km");
    expect(result?.fuelEconomyUnit).toBe("l/100km");
  });

  it("leaves both units unchanged (but still upserts) when neither is supplied", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ distanceUnit: "miles" as any, fuelEconomyUnit: "mpg" as any }) });
    const result = await updateBikeUnits("owner@example.com", "bike-1");
    expect(result?.distanceUnit).toBe("miles");
    expect(result?.fuelEconomyUnit).toBe("mpg");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// updateBikeCurrency
// ---------------------------------------------------------------------

describe("updateBikeCurrency", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeCurrency("owner@example.com", "missing", "gbp" as any)).toBeNull();
  });

  it("sets the currency and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike() });
    const result = await updateBikeCurrency("owner@example.com", "bike-1", "eur" as any);
    expect(result?.currency).toBe("eur");
  });
});

// ---------------------------------------------------------------------
// updateBikeIncludeInsuranceInReport
// ---------------------------------------------------------------------

describe("updateBikeIncludeInsuranceInReport", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeIncludeInsuranceInReport("owner@example.com", "missing", true)).toBeNull();
  });

  it("sets includeInsuranceInReport to true and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike() });
    const result = await updateBikeIncludeInsuranceInReport("owner@example.com", "bike-1", true);
    expect(result?.includeInsuranceInReport).toBe(true);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });

  it("sets includeInsuranceInReport back to false and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ includeInsuranceInReport: true }) });
    const result = await updateBikeIncludeInsuranceInReport("owner@example.com", "bike-1", false);
    expect(result?.includeInsuranceInReport).toBe(false);
  });
});

// ---------------------------------------------------------------------
// updateBikeIncludeFinanceInReport
// ---------------------------------------------------------------------

describe("updateBikeIncludeFinanceInReport", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeIncludeFinanceInReport("owner@example.com", "missing", true)).toBeNull();
  });

  it("sets includeFinanceInReport to true and upserts, independently of includeInsuranceInReport", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ includeInsuranceInReport: false }) });
    const result = await updateBikeIncludeFinanceInReport("owner@example.com", "bike-1", true);
    expect(result?.includeFinanceInReport).toBe(true);
    expect(result?.includeInsuranceInReport).toBe(false);
  });
});

// ---------------------------------------------------------------------
// setOriginalRegistration
// ---------------------------------------------------------------------

describe("setOriginalRegistration", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("reports not_found when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await setOriginalRegistration("owner@example.com", "missing", "AB12 CDE")).toEqual({ ok: false, reason: "not_found" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  // Defense in depth on top of the API route's own check - this must
  // refuse outright a second time, never quietly overwrite what's meant
  // to be permanent.
  it("refuses and reports already_set when originalRegistration is already present", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ originalRegistration: "AB12 CDE" }) });
    expect(await setOriginalRegistration("owner@example.com", "bike-1", "XY99 ZZZ")).toEqual({ ok: false, reason: "already_set" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets it once when previously unset", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ originalRegistration: undefined }) });
    const result = await setOriginalRegistration("owner@example.com", "bike-1", "AB12 CDE");
    expect(result).toEqual({ ok: true, bike: expect.objectContaining({ originalRegistration: "AB12 CDE" }) });
  });
});

// ---------------------------------------------------------------------
// addRegistrationChange
// ---------------------------------------------------------------------

describe("addRegistrationChange", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await addRegistrationChange("owner@example.com", "missing", "XY99 ZZZ", "correction")).toBeNull();
  });

  it("creates the registrationChanges list when there isn't one yet", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ registrationChanges: undefined }) });
    const result = await addRegistrationChange("owner@example.com", "bike-1", "XY99 ZZZ", "private-plate-assigned");
    expect(result?.registrationChanges).toHaveLength(1);
    expect(result?.registrationChanges?.[0]).toMatchObject({ plate: "XY99 ZZZ", reason: "private-plate-assigned" });
  });

  // Append-only guarantee from the source comment: never overwrites a
  // prior entry, always appends alongside it.
  it("appends to an existing history without disturbing prior entries", async () => {
    mocks.read.mockResolvedValue({
      resource: makeBike({ registrationChanges: [{ plate: "OLD1 ABC", reason: "correction", changedAt: "2024-01-01T00:00:00.000Z" }] }),
    });
    const result = await addRegistrationChange("owner@example.com", "bike-1", "NEW1 XYZ", "private-plate-removed");
    expect(result?.registrationChanges).toHaveLength(2);
    expect(result?.registrationChanges?.[0].plate).toBe("OLD1 ABC");
    expect(result?.registrationChanges?.[1].plate).toBe("NEW1 XYZ");
  });
});

// ---------------------------------------------------------------------
// deleteBike
// ---------------------------------------------------------------------

describe("deleteBike", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.deleteFn.mockResolvedValue(undefined);
  });

  function mockRecordsByType(fixtures: Record<string, Array<{ id: string }>>) {
    mocks.fetchAll.mockImplementation(async (queryObj: any) => {
      const type = queryObj.parameters.find((p: any) => p.name === "@type")?.value;
      return { resources: fixtures[type] ?? [] };
    });
  }

  it("queries and deletes every matching record across all six record types", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ shareToken: undefined }) });
    mockRecordsByType({
      serviceRecord: [{ id: "sr-1" }],
      fuelLog: [{ id: "fl-1" }, { id: "fl-2" }],
      mod: [],
      bill: [{ id: "bl-1" }],
      billSeries: [],
      reminder: [],
    });

    await deleteBike("owner@example.com", "bike-1");

    const queriedTypes = mockContainer.items.query.mock.calls.map((call: any) => call[0].parameters.find((p: any) => p.name === "@type").value);
    expect(queriedTypes.sort()).toEqual(["bill", "billSeries", "fuelLog", "mod", "reminder", "serviceRecord"].sort());
    // 4 real records deleted, plus the bike document itself = 5 deletes.
    expect(mocks.deleteFn).toHaveBeenCalledTimes(5);
  });

  it("also deletes the share-link document, keyed by its own token as both id and partition key", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ shareToken: "tok_abc123" }) });
    mockRecordsByType({});

    await deleteBike("owner@example.com", "bike-1");

    expect(mockContainer.item).toHaveBeenCalledWith("tok_abc123", "tok_abc123");
  });

  it("skips the share-link deletion entirely when the bike has no shareToken", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ shareToken: undefined }) });
    mockRecordsByType({});

    await deleteBike("owner@example.com", "bike-1");

    // Only the final bike-document delete call, none for a share token.
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });

  // Explicit try/catch in the source: an already-gone or never-existed
  // share-link doc must not fail the whole deletion.
  it("swallows an error deleting the share-link doc and still deletes the bike itself", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ shareToken: "tok_abc123" }) });
    mockRecordsByType({});
    // Only the share-token delete fails - the bike's own delete call
    // (a separate container.item(...) call, keyed by bikeId not the
    // token) must still go through afterward.
    mockContainer.item.mockImplementation((id?: string) => ({
      read: mocks.read,
      delete: id === "tok_abc123" ? vi.fn(async () => { throw new Error("already gone"); }) : mocks.deleteFn,
    }));

    await expect(deleteBike("owner@example.com", "bike-1")).resolves.toBeUndefined();
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });

  it("deletes the bike document itself last", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ shareToken: undefined, id: "bike-1" }) });
    mockRecordsByType({});

    await deleteBike("owner@example.com", "bike-1");

    expect(mockContainer.item).toHaveBeenCalledWith("bike-1", "owner@example.com");
  });

  it("does not throw when the bike document itself was already gone (no resource on read)", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    mockRecordsByType({});

    await expect(deleteBike("owner@example.com", "bike-1")).resolves.toBeUndefined();
    // No shareToken to look up on an undefined bike - guarded by `bike?.shareToken`.
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// updateBikeChartType
// ---------------------------------------------------------------------

describe("updateBikeChartType", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the bike doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateBikeChartType("owner@example.com", "missing", "spend", "bar")).toBeNull();
  });

  it("creates the chartTypes map when none exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ chartTypes: undefined }) });
    const result = await updateBikeChartType("owner@example.com", "bike-1", "spend", "bar");
    expect(result?.chartTypes).toEqual({ spend: "bar" });
  });

  // Explicit guarantee from the source comment: setting one chart's type
  // must not disturb any other chart's already-saved preference.
  it("merges a new chart's type in without disturbing another chart's saved preference", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ chartTypes: { spend: "bar" } }) });
    const result = await updateBikeChartType("owner@example.com", "bike-1", "mileage", "line");
    expect(result?.chartTypes).toEqual({ spend: "bar", mileage: "line" });
  });

  it("overwrites only the targeted chart's own existing preference", async () => {
    mocks.read.mockResolvedValue({ resource: makeBike({ chartTypes: { spend: "bar", mileage: "line" } }) });
    const result = await updateBikeChartType("owner@example.com", "bike-1", "spend", "pie");
    expect(result?.chartTypes).toEqual({ spend: "pie", mileage: "line" });
  });
});