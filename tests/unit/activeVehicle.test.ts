import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getBikesForUser: vi.fn(),
  pickActiveBike: vi.fn(),
  getCarsForUser: vi.fn(),
  pickActiveCar: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  pickActiveBike: mocks.pickActiveBike,
  isBikeReadOnly: (b: { transferredTo?: unknown }) => !!b.transferredTo,
}));
vi.mock("@/lib/tracker/car", () => ({
  getCarsForUser: mocks.getCarsForUser,
  pickActiveCar: mocks.pickActiveCar,
  isCarReadOnly: (c: { transferredTo?: unknown }) => !!c.transferredTo,
}));

import { resolveActiveVehicle, resolveAllActiveVehicles, ACTIVE_VEHICLE_KIND_COOKIE } from "@/lib/tracker/activeVehicle";

const email = "driver@example.com";
const bike = { id: "bike-1", type: "bike" as const, make: "Honda" } as any;
const car = { id: "car-1", type: "car" as const, make: "Ford" } as any;

function cookieStoreWithKind(kind?: string) {
  return { get: (name: string) => (name === ACTIVE_VEHICLE_KIND_COOKIE && kind ? { value: kind } : undefined) };
}

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
});

describe("resolveActiveVehicle", () => {
  it("returns null when the account has neither a bike nor a car", async () => {
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([]);
    mocks.cookies.mockResolvedValue(cookieStoreWithKind());
    expect(await resolveActiveVehicle(email)).toBeNull();
  });

  it("defaults to bike when no kind preference is recorded, for an account with both", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([car]);
    mocks.pickActiveBike.mockResolvedValue(bike);
    mocks.cookies.mockResolvedValue(cookieStoreWithKind());
    const result = await resolveActiveVehicle(email);
    expect(result).toEqual({ kind: "bike", bike, hasAnyCar: true });
  });

  it("resolves to car when the kind cookie says car and the account has one", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([car]);
    mocks.pickActiveCar.mockResolvedValue(car);
    mocks.cookies.mockResolvedValue(cookieStoreWithKind("car"));
    const result = await resolveActiveVehicle(email);
    expect(result).toEqual({ kind: "car", car, hasAnyBike: true });
  });

  it("falls back to bike when the kind cookie says car but the account has no car (anymore)", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([]);
    mocks.pickActiveBike.mockResolvedValue(bike);
    mocks.cookies.mockResolvedValue(cookieStoreWithKind("car"));
    const result = await resolveActiveVehicle(email);
    expect(result).toEqual({ kind: "bike", bike, hasAnyCar: false });
  });

  it("resolves to car for a car-only account regardless of the kind cookie", async () => {
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([car]);
    mocks.pickActiveCar.mockResolvedValue(car);
    mocks.cookies.mockResolvedValue(cookieStoreWithKind());
    const result = await resolveActiveVehicle(email);
    expect(result).toEqual({ kind: "car", car, hasAnyBike: false });
  });

  it("resolves to bike for a bike-only account even when the kind cookie says car", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([]);
    mocks.pickActiveBike.mockResolvedValue(bike);
    mocks.cookies.mockResolvedValue(cookieStoreWithKind("car"));
    const result = await resolveActiveVehicle(email);
    expect(result).toEqual({ kind: "bike", bike, hasAnyCar: false });
  });
});

describe("resolveAllActiveVehicles", () => {
  it("returns an empty list for an account with no vehicles at all", async () => {
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([]);
    expect(await resolveAllActiveVehicles(email)).toEqual([]);
  });

  it("returns just the bike for a bike-only account", async () => {
    mocks.getBikesForUser.mockResolvedValue([bike]);
    mocks.getCarsForUser.mockResolvedValue([]);
    expect(await resolveAllActiveVehicles(email)).toEqual([{ kind: "bike", bike }]);
  });

  it("returns just the car for a car-only account", async () => {
    mocks.getBikesForUser.mockResolvedValue([]);
    mocks.getCarsForUser.mockResolvedValue([car]);
    expect(await resolveAllActiveVehicles(email)).toEqual([{ kind: "car", car }]);
  });

  it("returns every bike and car together for a hybrid account", async () => {
    const secondBike = { id: "bike-2", type: "bike" as const, make: "Yamaha" } as any;
    mocks.getBikesForUser.mockResolvedValue([bike, secondBike]);
    mocks.getCarsForUser.mockResolvedValue([car]);
    expect(await resolveAllActiveVehicles(email)).toEqual([
      { kind: "bike", bike },
      { kind: "bike", bike: secondBike },
      { kind: "car", car },
    ]);
  });

  it("excludes a transferred-away (read-only) vehicle of either kind", async () => {
    const transferredBike = { id: "bike-3", type: "bike" as const, make: "Suzuki", transferredTo: "new-owner@example.com" } as any;
    const transferredCar = { id: "car-2", type: "car" as const, make: "VW", transferredTo: "new-owner@example.com" } as any;
    mocks.getBikesForUser.mockResolvedValue([bike, transferredBike]);
    mocks.getCarsForUser.mockResolvedValue([car, transferredCar]);
    expect(await resolveAllActiveVehicles(email)).toEqual([
      { kind: "bike", bike },
      { kind: "car", car },
    ]);
  });
});
