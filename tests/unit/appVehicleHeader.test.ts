import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  headerGet: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({ getContainer: () => ({}) }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ get: mocks.cookieGet })),
  headers: vi.fn(async () => ({ get: mocks.headerGet })),
}));

import { pickActiveBike, type BikeDoc } from "@/lib/tracker/bike";
import { pickActiveCar, type CarDoc } from "@/lib/tracker/car";

const bikes = [{ id: "bike-a" }, { id: "bike-b" }] as BikeDoc[];
const cars = [{ id: "car-a" }, { id: "car-b" }] as CarDoc[];

function sendHeaders(values: Record<string, string>) {
  mocks.headerGet.mockImplementation((name: string) => values[name] ?? null);
}

beforeEach(() => {
  mocks.cookieGet.mockReset().mockReturnValue(undefined);
  mocks.headerGet.mockReset().mockReturnValue(null);
});

describe("the app's vehicle header", () => {
  it("picks the bike the app names when there's no cookie", async () => {
    sendHeaders({ "x-rv-bike-id": "bike-b" });
    expect(await pickActiveBike(bikes)).toBe(bikes[1]);
  });

  it("picks the car the app names when there's no cookie", async () => {
    sendHeaders({ "x-rv-car-id": "car-b" });
    expect(await pickActiveCar(cars)).toBe(cars[1]);
  });

  it("never overrides the website's cookie", async () => {
    mocks.cookieGet.mockReturnValue({ value: "bike-a" });
    sendHeaders({ "x-rv-bike-id": "bike-b" });
    expect(await pickActiveBike(bikes)).toBe(bikes[0]);
  });

  it("can't reach a vehicle outside the account's own list", async () => {
    sendHeaders({ "x-rv-bike-id": "someone-elses-bike", "x-rv-car-id": "someone-elses-car" });
    expect(await pickActiveBike(bikes)).toBe(bikes[0]);
    expect(await pickActiveCar(cars)).toBe(cars[0]);
  });

  it("keeps a bike header from choosing a car, and the other way round", async () => {
    sendHeaders({ "x-rv-bike-id": "car-b", "x-rv-car-id": "bike-b" });
    expect(await pickActiveBike(bikes)).toBe(bikes[0]);
    expect(await pickActiveCar(cars)).toBe(cars[0]);
  });
});
