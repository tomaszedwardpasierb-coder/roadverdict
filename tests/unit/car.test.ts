import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
  fetchAll: vi.fn(),
  cookieGet: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: {
    upsert: mocks.upsert,
    query: vi.fn((queryObj: unknown, options: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj, options) })),
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.cookieGet })) }));
// No isPro mock, deliberately unlike bike.ts's own test file - createCar
// has no free-tier cap (see the ADR: no unified Pro-cap logic has been
// built for cars yet, since that's a business decision for a later pass).

import {
  generateCarId,
  isCarReadOnly,
  countActiveCars,
  getCurrentRegistration,
  getCarsForUser,
  findCarByRegistrationAcrossAccounts,
  pickActiveCar,
  getPrimaryCar,
  getCarById,
  createCar,
  updateCarMileage,
  updateCarDvlaData,
  updateCarRegion,
  updateCarBudget,
  updateCarUnits,
  updateCarCurrency,
  addCarRegistrationChange,
  deleteCar,
  updateCarChartType,
  queryCarTrackerDocs,
  type CarDoc,
} from "@/lib/tracker/car";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mockContainer.items.query.mockClear();
}

function makeCar(overrides: Partial<CarDoc> = {}): CarDoc {
  return {
    id: "owner@example.com::car::1000::abc123",
    pk: "owner@example.com",
    type: "car",
    make: "Ford",
    model: "Focus",
    fuelType: "petrol",
    engineLitres: 1.0,
    currentMileage: 5000,
    startingMileage: 100,
    nickname: "The Runabout",
    dateAdded: "2024-01-01",
    ...overrides,
  };
}

describe("generateCarId", () => {
  it("embeds the owner's email as the leading segment", () => {
    expect(generateCarId("owner@example.com")).toMatch(/^owner@example\.com::car::\d+::[a-z0-9]+$/);
  });

  it("produces a different id on every call, even generated back to back", () => {
    const first = generateCarId("owner@example.com");
    const second = generateCarId("owner@example.com");
    expect(first).not.toBe(second);
  });
});

describe("isCarReadOnly", () => {
  it("is false for a car with no transferredTo", () => {
    expect(isCarReadOnly(makeCar())).toBe(false);
  });

  it("is true once transferredTo is set", () => {
    expect(
      isCarReadOnly(makeCar({ transferredTo: { newCarId: "c2", newOwnerEmail: "buyer@example.com", transferredAt: "2025-01-01" } }))
    ).toBe(true);
  });
});

describe("countActiveCars", () => {
  it("counts every car when none have been transferred", () => {
    expect(countActiveCars([makeCar({ id: "a" }), makeCar({ id: "b" })])).toBe(2);
  });

  it("excludes transferred (read-only) cars from the count", () => {
    const cars = [
      makeCar({ id: "a" }),
      makeCar({ id: "b", transferredTo: { newCarId: "c", newOwnerEmail: "x@example.com", transferredAt: "2025-01-01" } }),
    ];
    expect(countActiveCars(cars)).toBe(1);
  });

  it("returns 0 for an empty list", () => {
    expect(countActiveCars([])).toBe(0);
  });
});

describe("getCurrentRegistration", () => {
  it("returns the original registration when there's no history of changes", () => {
    expect(getCurrentRegistration(makeCar({ originalRegistration: "AB12 CDE" }))).toBe("AB12 CDE");
  });

  it("returns the most recent change, not the original, once the plate has changed", () => {
    const car = makeCar({
      originalRegistration: "AB12 CDE",
      registrationChanges: [
        { plate: "XY99 ZZZ", reason: "private-plate-assigned", changedAt: "2024-06-01" },
        { plate: "MN01 ABC", reason: "correction", changedAt: "2024-09-01" },
      ],
    });
    expect(getCurrentRegistration(car)).toBe("MN01 ABC");
  });

  it("returns undefined for a car with no registration on record at all", () => {
    expect(getCurrentRegistration(makeCar({ originalRegistration: undefined }))).toBeUndefined();
  });
});

describe("getCarsForUser", () => {
  beforeEach(resetAllMocks);

  it("queries the user's own partition, ordered oldest first, and returns the resources", async () => {
    const cars = [makeCar({ id: "a" }), makeCar({ id: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: cars });

    const result = await getCarsForUser("owner@example.com");

    expect(result).toEqual(cars);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.type = 'car'");
    expect(query.query).toContain("ORDER BY c.dateAdded ASC");
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });

  it("returns an empty list when the user has no cars", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getCarsForUser("owner@example.com")).toEqual([]);
  });
});

describe("findCarByRegistrationAcrossAccounts", () => {
  beforeEach(resetAllMocks);

  it("returns null without querying when the registration normalizes to empty", async () => {
    expect(await findCarByRegistrationAcrossAccounts("   ")).toBeNull();
    expect(mockContainer.items.query).not.toHaveBeenCalled();
  });

  it("normalizes the registration to uppercase with no spaces before querying", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await findCarByRegistrationAcrossAccounts("ab12 cde");
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@reg", value: "AB12CDE" }]);
  });

  it("returns null when no car anywhere carries that plate", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await findCarByRegistrationAcrossAccounts("AB12CDE")).toBeNull();
  });

  it("prefers the currently-active match over an already-transferred historical one", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { id: "old-car", pk: "seller@example.com", transferredTo: { newCarId: "new-car" } },
        { id: "new-car", pk: "buyer@example.com", transferredTo: undefined },
      ],
    });
    expect(await findCarByRegistrationAcrossAccounts("AB12CDE")).toEqual({
      ownerEmail: "buyer@example.com",
      carId: "new-car",
    });
  });
});

describe("pickActiveCar", () => {
  beforeEach(resetAllMocks);

  it("returns null for an empty list without ever reading the cookie", async () => {
    expect(await pickActiveCar([])).toBeNull();
    expect(mocks.cookieGet).not.toHaveBeenCalled();
  });

  it("falls back to the first (oldest) car when no active-car cookie is set", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const cars = [makeCar({ id: "a" }), makeCar({ id: "b" })];
    expect(await pickActiveCar(cars)).toBe(cars[0]);
  });

  it("returns the car the cookie points to, even when it isn't the first one", async () => {
    mocks.cookieGet.mockReturnValue({ value: "b" });
    const cars = [makeCar({ id: "a" }), makeCar({ id: "b" })];
    expect(await pickActiveCar(cars)).toBe(cars[1]);
  });

  it("falls back to the first car when the cookie references a car not in the list", async () => {
    mocks.cookieGet.mockReturnValue({ value: "does-not-exist" });
    const cars = [makeCar({ id: "a" }), makeCar({ id: "b" })];
    expect(await pickActiveCar(cars)).toBe(cars[0]);
  });
});

describe("getPrimaryCar", () => {
  beforeEach(resetAllMocks);

  it("returns null when the user has no cars at all", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getPrimaryCar("owner@example.com")).toBeNull();
  });

  it("resolves whichever car the switcher cookie names", async () => {
    mocks.cookieGet.mockReturnValue({ value: "b" });
    const cars = [makeCar({ id: "a" }), makeCar({ id: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: cars });
    expect(await getPrimaryCar("owner@example.com")).toStrictEqual(cars[1]);
  });
});

describe("getCarById", () => {
  beforeEach(resetAllMocks);

  it("returns the car when it exists", async () => {
    const car = makeCar();
    mocks.read.mockResolvedValue({ resource: car });
    expect(await getCarById("owner@example.com", car.id)).toEqual(car);
  });

  it("returns null when no document exists at that id", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getCarById("owner@example.com", "missing")).toBeNull();
  });

  it("fails soft to null if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => { throw new Error("cosmos unavailable"); }),
      delete: mocks.deleteFn,
    });
    expect(await getCarById("owner@example.com", "car-1")).toBeNull();
  });
});

describe("createCar", () => {
  const newCarData = {
    make: "Renault",
    model: "Trafic",
    fuelType: "diesel" as const,
    engineLitres: 2.0,
    registration: "AB12 CDE",
    currentMileage: 1200,
    nickname: "Van",
    region: "rest-england-wales" as const,
  };

  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("creates the car with startingMileage pinned to the initial currentMileage - no free-tier cap, unlike createBike", async () => {
    const car = await createCar("owner@example.com", newCarData);
    expect(car).toMatchObject({
      pk: "owner@example.com",
      type: "car",
      make: "Renault",
      model: "Trafic",
      fuelType: "diesel",
      originalRegistration: "AB12 CDE",
      currentMileage: 1200,
      startingMileage: 1200,
      nickname: "Van",
    });
    expect(mocks.upsert).toHaveBeenCalledWith(car);
  });

  it("passes engineLitres through for an ICE car", async () => {
    const car = await createCar("owner@example.com", newCarData);
    expect(car.engineLitres).toBe(2.0);
    expect(car.batteryKwh).toBeUndefined();
  });

  it("passes batteryKwh through for an electric car, with no engineLitres", async () => {
    const car = await createCar("owner@example.com", { ...newCarData, fuelType: "electric", engineLitres: undefined, batteryKwh: 64 });
    expect(car.fuelType).toBe("electric");
    expect(car.batteryKwh).toBe(64);
    expect(car.engineLitres).toBeUndefined();
  });

  it("passes optional fields (year, isCustomBuild, mayHavePriorHistory) through when supplied", async () => {
    const car = await createCar("owner@example.com", { ...newCarData, year: 2019, isCustomBuild: true, mayHavePriorHistory: true });
    expect(car.year).toBe(2019);
    expect(car.isCustomBuild).toBe(true);
    expect(car.mayHavePriorHistory).toBe(true);
  });
});

describe("simple single-field car updates", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  const cases: Array<{ name: string; call: () => Promise<CarDoc | null>; field: keyof CarDoc; expected: unknown }> = [
    { name: "updateCarMileage", call: () => updateCarMileage("owner@example.com", "car-1", 5500), field: "currentMileage", expected: 5500 },
    { name: "updateCarRegion", call: () => updateCarRegion("owner@example.com", "car-1", "scotland-ni"), field: "region", expected: "scotland-ni" },
    { name: "updateCarBudget", call: () => updateCarBudget("owner@example.com", "car-1", 900), field: "annualBudget", expected: 900 },
    { name: "updateCarCurrency", call: () => updateCarCurrency("owner@example.com", "car-1", "eur" as any), field: "currency", expected: "eur" },
  ];

  it.each(cases)("$name returns null and does not upsert when the car doesn't exist", async ({ call }) => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await call()).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each(cases)("$name sets its field and upserts the changed document", async ({ call, field, expected }) => {
    mocks.read.mockResolvedValue({ resource: makeCar() });
    const result = await call();
    expect((result as any)?.[field]).toEqual(expected);
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("updateCarDvlaData", () => {
  const dvlaBase = { fetchedAt: "2025-01-01T00:00:00.000Z", keeperChangeList: [], plateChangeList: [], v5cIssueDates: [] };

  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the car doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateCarDvlaData("owner@example.com", "missing", { ...dvlaBase })).toBeNull();
  });

  it("stores the dvlaData snapshot on the car", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar() });
    const data = { ...dvlaBase, officialCombinedMpg: 55 };
    const result = await updateCarDvlaData("owner@example.com", "car-1", data);
    expect(result?.dvlaData).toEqual(data);
  });
});

describe("updateCarUnits", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the car doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateCarUnits("owner@example.com", "missing", "km" as any)).toBeNull();
  });

  it("updates distanceUnit when supplied", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar({ distanceUnit: "miles" as any }) });
    const result = await updateCarUnits("owner@example.com", "car-1", "km" as any);
    expect(result?.distanceUnit).toBe("km");
  });

  it("leaves distanceUnit unchanged (but still upserts) when not supplied", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar({ distanceUnit: "miles" as any }) });
    const result = await updateCarUnits("owner@example.com", "car-1");
    expect(result?.distanceUnit).toBe("miles");
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("addCarRegistrationChange", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the car doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await addCarRegistrationChange("owner@example.com", "missing", "XY99 ZZZ", "correction")).toBeNull();
  });

  it("creates the registrationChanges list when there isn't one yet", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar({ registrationChanges: undefined }) });
    const result = await addCarRegistrationChange("owner@example.com", "car-1", "XY99 ZZZ", "private-plate-assigned");
    expect(result?.registrationChanges).toHaveLength(1);
    expect(result?.registrationChanges?.[0]).toMatchObject({ plate: "XY99 ZZZ", reason: "private-plate-assigned" });
  });

  it("appends to an existing history without disturbing prior entries", async () => {
    mocks.read.mockResolvedValue({
      resource: makeCar({ registrationChanges: [{ plate: "OLD1 ABC", reason: "correction", changedAt: "2024-01-01T00:00:00.000Z" }] }),
    });
    const result = await addCarRegistrationChange("owner@example.com", "car-1", "NEW1 XYZ", "private-plate-removed");
    expect(result?.registrationChanges).toHaveLength(2);
    expect(result?.registrationChanges?.[0].plate).toBe("OLD1 ABC");
    expect(result?.registrationChanges?.[1].plate).toBe("NEW1 XYZ");
  });
});

describe("updateCarChartType", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("creates the chartTypes map when none exists yet", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar({ chartTypes: undefined }) });
    const result = await updateCarChartType("owner@example.com", "car-1", "spend", "bar");
    expect(result?.chartTypes).toEqual({ spend: "bar" });
  });

  it("merges a new chart's type in without disturbing another chart's saved preference", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar({ chartTypes: { spend: "bar" } }) });
    const result = await updateCarChartType("owner@example.com", "car-1", "mileage", "line");
    expect(result?.chartTypes).toEqual({ spend: "bar", mileage: "line" });
  });
});

describe("deleteCar", () => {
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

  it("queries and deletes every matching record across all four car record types", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar() });
    mockRecordsByType({
      carServiceRecord: [{ id: "sr-1" }],
      carFuelLog: [{ id: "fl-1" }, { id: "fl-2" }],
      carMod: [],
      carBill: [{ id: "bl-1" }],
    });

    await deleteCar("owner@example.com", "car-1");

    const queriedTypes = mockContainer.items.query.mock.calls.map((call: any) => call[0].parameters.find((p: any) => p.name === "@type").value);
    expect(queriedTypes.sort()).toEqual(["carBill", "carFuelLog", "carMod", "carServiceRecord"].sort());
    // 4 real records deleted, plus the car document itself = 5 deletes.
    expect(mocks.deleteFn).toHaveBeenCalledTimes(5);
  });

  it("scopes every record-type query by carId, not just type", async () => {
    mocks.read.mockResolvedValue({ resource: makeCar() });
    mockRecordsByType({});
    await deleteCar("owner@example.com", "car-1");
    for (const call of mockContainer.items.query.mock.calls) {
      const params = (call[0] as any).parameters;
      expect(params.find((p: any) => p.name === "@carId")?.value).toBe("car-1");
    }
  });

  it("does not throw when the car document itself was already gone", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    mockRecordsByType({});
    await expect(deleteCar("owner@example.com", "car-1")).resolves.toBeUndefined();
  });
});

describe("queryCarTrackerDocs", () => {
  beforeEach(resetAllMocks);

  it("filters by c.carId, not c.bikeId - the whole reason this exists separately from queryTrackerDocs", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await queryCarTrackerDocs("owner@example.com", "carServiceRecord", "car-1");
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.carId = @carId");
    expect(query.query).not.toContain("c.bikeId");
    expect(query.parameters).toEqual([
      { name: "@type", value: "carServiceRecord" },
      { name: "@carId", value: "car-1" },
    ]);
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });

  it("orders results newest first", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await queryCarTrackerDocs("owner@example.com", "carFuelLog", "car-1");
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("ORDER BY c.date DESC");
  });
});
