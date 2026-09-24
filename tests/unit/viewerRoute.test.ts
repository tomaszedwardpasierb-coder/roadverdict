import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession: mockGetSession }));

const mockGetBikesForUser = vi.hoisted(() => vi.fn());
const mockPickActiveBike = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tracker/bike", () => ({ getBikesForUser: mockGetBikesForUser, pickActiveBike: mockPickActiveBike }));

const mockGetCarsForUser = vi.hoisted(() => vi.fn());
const mockPickActiveCar = vi.hoisted(() => vi.fn());
vi.mock("@/lib/tracker/car", () => ({ getCarsForUser: mockGetCarsForUser, pickActiveCar: mockPickActiveCar }));

import { GET } from "../../src/app/api/viewer/route";

describe("GET /api/viewer", () => {
  beforeEach(() => {
    mockGetSession.mockReset();
    mockGetBikesForUser.mockReset();
    mockPickActiveBike.mockReset();
    mockGetCarsForUser.mockReset();
    mockPickActiveCar.mockReset();
    mockGetBikesForUser.mockResolvedValue([]);
    mockGetCarsForUser.mockResolvedValue([]);
    mockPickActiveBike.mockResolvedValue(null);
    mockPickActiveCar.mockResolvedValue(null);
  });

  it("returns the anonymous viewer, without touching the database, when there's no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();

    expect(await res.json()).toEqual({ signedIn: false, hasBike: false, hasCar: false });
    expect(mockGetBikesForUser).not.toHaveBeenCalled();
    expect(mockGetCarsForUser).not.toHaveBeenCalled();
  });

  it("degrades to anonymous, not a 500, if the session lookup throws (e.g. Cosmos down)", async () => {
    mockGetSession.mockRejectedValue(new Error("cosmos down"));
    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ signedIn: false, hasBike: false, hasCar: false });
  });

  it("is never cacheable - it answers for whoever's cookie is on the request", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns signed-in with no vehicle prefill for an account with no bike or car", async () => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    const res = await GET();

    expect(await res.json()).toEqual({ signedIn: true, hasBike: false, hasCar: false });
  });

  it("derives the bike prefill: brand slug from the make, class from engine size, and the matching model", async () => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    const bike = { id: "b1", make: "Yamaha", model: "MT-07", engineCC: 689 };
    mockGetBikesForUser.mockResolvedValue([bike]);
    mockPickActiveBike.mockResolvedValue(bike);

    const body = await (await GET()).json();

    expect(body.signedIn).toBe(true);
    expect(body.hasBike).toBe(true);
    expect(body.hasCar).toBe(false);
    expect(body.bike.brand).toBe("yamaha");
    expect(body.bike.bikeClass).toBe("medium");
    expect(body.bike.model).toBeDefined();
    expect(body.car).toBeUndefined();
  });

  it("falls back to the 'other' brand for a make outside the curated list", async () => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    const bike = { id: "b1", make: "Totally Unknown Marque", model: "X1", engineCC: 125 };
    mockGetBikesForUser.mockResolvedValue([bike]);
    mockPickActiveBike.mockResolvedValue(bike);

    const body = await (await GET()).json();
    expect(body.bike.brand).toBe("other");
    expect(body.bike.bikeClass).toBe("small");
  });

  it("derives the car prefill: brand slug and engine-size class, for the ACTIVE car", async () => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    const car = { id: "c1", make: "BMW", model: "640i", fuelType: "petrol", engineLitres: 3.0 };
    mockGetCarsForUser.mockResolvedValue([car]);
    mockPickActiveCar.mockResolvedValue(car);

    const body = await (await GET()).json();
    expect(body.hasCar).toBe(true);
    expect(body.car).toEqual({ brand: "bmw", carClass: "large" });
    expect(body.bike).toBeUndefined();
  });

  it.each([
    [1.0, "small"],
    [1.2, "small"],
    [1.6, "medium"],
    [2.0, "medium"],
    [2.1, "large"],
  ])("classes a %sL petrol car as %s", async (litres, expected) => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    const car = { id: "c1", make: "Ford", model: "Focus", fuelType: "petrol", engineLitres: litres };
    mockGetCarsForUser.mockResolvedValue([car]);
    mockPickActiveCar.mockResolvedValue(car);

    expect((await (await GET()).json()).car.carClass).toBe(expected);
  });

  it("gives an electric car no class (there's no engine size to derive one from)", async () => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    const car = { id: "c1", make: "Tesla", model: "Model 3", fuelType: "electric", engineLitres: undefined };
    mockGetCarsForUser.mockResolvedValue([car]);
    mockPickActiveCar.mockResolvedValue(car);

    const body = await (await GET()).json();
    expect(body.car.carClass).toBeUndefined();
    expect(body.car.brand).toBe("tesla");
  });

  it("still returns the rest of the viewer if one of the two vehicle lookups fails", async () => {
    mockGetSession.mockResolvedValue({ email: "a@example.com" });
    mockGetBikesForUser.mockRejectedValue(new Error("boom"));
    const car = { id: "c1", make: "BMW", model: "640i", fuelType: "petrol", engineLitres: 3.0 };
    mockGetCarsForUser.mockResolvedValue([car]);
    mockPickActiveCar.mockResolvedValue(car);

    const body = await (await GET()).json();
    expect(body.signedIn).toBe(true);
    expect(body.hasBike).toBe(false);
    expect(body.hasCar).toBe(true);
  });
});
