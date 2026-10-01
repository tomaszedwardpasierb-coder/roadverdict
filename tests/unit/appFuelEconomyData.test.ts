import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBike: vi.fn(),
  getCarById: vi.fn(),
  getFuelLogs: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getExchangeRates: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/currencyRates", () => ({ getExchangeRates: mocks.getExchangeRates }));

import { getFuelEconomy } from "@/lib/app/fuelEconomyData";

const EMAIL = "rider@example.com";
const fill = (id: string, mileage: number, litres: number, cost: number, date: string) => ({ id, mileage, litres, cost, date, filledToFull: true });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getExchangeRates.mockResolvedValue(null);
});

describe("getFuelEconomy", () => {
  it("returns null for a vehicle that isn't this account's", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getFuelEconomy(EMAIL, "bike", "not-mine")).toBeNull();
    mocks.getCarById.mockResolvedValue(null);
    expect(await getFuelEconomy(EMAIL, "car", "not-mine")).toBeNull();
    expect(mocks.getFuelLogs).not.toHaveBeenCalled();
  });

  it("gives a bike's average, last tank and last price, in its own units", async () => {
    mocks.getBike.mockResolvedValue({ id: "b1", fuelEconomyUnit: "l100km", distanceUnit: "km", currency: "GBP", dvlaData: { officialCombinedMpg: 64 } });
    mocks.getFuelLogs.mockResolvedValue([
      fill("f1", 1000, 10, 15, "2026-08-01"),
      fill("f2", 1200, 18.2, 27.3, "2026-08-20"),
      fill("f3", 1400, 18.2, 27.3, "2026-09-12"),
    ]);
    const data = await getFuelEconomy(EMAIL, "bike", "b1");
    expect(data).toMatchObject({ electric: false, officialMpg: 64, fuelEconomyUnit: "l100km", distanceUnit: "km", currency: "GBP", preferredFuel: "petrol" });
    expect(data?.summary.trustedTanks).toBe(2);
    expect(data?.summary.lastTank).toMatchObject({ miles: 200, litres: 18.2, date: "2026-09-12" });
    expect(data?.summary.lastPrice).toEqual({ perLitre: 1.5, date: "2026-09-12" });
  });

  it("says a fully electric car has no MPG, without reading its charges", async () => {
    mocks.getCarById.mockResolvedValue({ id: "c1", fuelType: "electric" });
    const data = await getFuelEconomy(EMAIL, "car", "c1");
    expect(data?.electric).toBe(true);
    expect(data?.summary.averageMpg).toBeNull();
    expect(mocks.getCarFuelLogs).not.toHaveBeenCalled();
  });

  it("works a car out from its fill-ups only, offering diesel prices to a diesel", async () => {
    mocks.getCarById.mockResolvedValue({ id: "c1", fuelType: "diesel" });
    mocks.getCarFuelLogs.mockResolvedValue([
      fill("f1", 1000, 40, 60, "2026-08-01"),
      { id: "charge", mileage: 1100, litres: null, kwh: 20, cost: 8, date: "2026-08-10" },
      fill("f2", 1500, 40, 60, "2026-08-20"),
    ]);
    const data = await getFuelEconomy(EMAIL, "car", "c1");
    expect(data?.preferredFuel).toBe("diesel");
    expect(data?.summary.trustedTanks).toBe(1);
    expect(data?.summary.averageMpg).toBeCloseTo(56.8, 1);
  });
});
