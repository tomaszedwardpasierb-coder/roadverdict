import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
  queryCarTrackerDocs: vi.fn(),
}));

vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));
vi.mock("@/lib/tracker/car", () => ({ queryCarTrackerDocs: mocks.queryCarTrackerDocs }));

import { createCarFuelLog, getCarFuelLogs, updateCarFuelLog, deleteCarFuelLog } from "@/lib/tracker/carFuelLog";

const email = "driver@example.com";
const carId = "car-1";

const petrolFill = {
  id: `${email}::carFuel::1`,
  pk: email,
  type: "carFuelLog" as const,
  carId,
  fuelType: "petrol" as const,
  litres: 40,
  cost: 60,
  mileage: 12000,
  filledToFull: true,
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(petrolFill);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(petrolFill);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarFuelLog", () => {
  it("delegates to createTrackerDoc with idPrefix 'carFuel' and type 'carFuelLog'", async () => {
    await createCarFuelLog(email, { carId, fuelType: "petrol", litres: 40, cost: 60, mileage: 12000, date: "2025-01-01", filledToFull: true });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(email, "carFuel", "carFuelLog", expect.objectContaining({ litres: 40, cost: 60 }));
  });

  // The one genuinely new shape this doc type has that no motorcycle
  // fuel log needs: an EV charging session carries kwh, never litres.
  it("logs an EV charging session with kwh and no litres field", async () => {
    await createCarFuelLog(email, { carId, fuelType: "electric", kwh: 45, cost: 12, mileage: 12000, date: "2025-01-01" });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.kwh).toBe(45);
    expect(payload.litres).toBeUndefined();
    expect(payload.fuelType).toBe("electric");
  });

  it("filledToFull is optional and absent for a charging session, unlike an ICE fill-up", async () => {
    await createCarFuelLog(email, { carId, fuelType: "electric", kwh: 45, cost: 12, mileage: 12000, date: "2025-01-01" });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.filledToFull).toBeUndefined();
  });
});

describe("getCarFuelLogs", () => {
  it("delegates to queryCarTrackerDocs with type 'carFuelLog'", async () => {
    await getCarFuelLogs(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carFuelLog", carId);
  });
});

describe("updateCarFuelLog", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarFuelLog(email, petrolFill.id, { fuelType: "petrol", litres: 42, cost: 63, mileage: 12300, date: "2025-01-05", filledToFull: true });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, petrolFill.id, expect.objectContaining({ litres: 42, cost: 63 }));
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateCarFuelLog(email, "missing", { fuelType: "petrol", litres: 1, cost: 1, mileage: 1, date: "2025-01-01" })).toBeNull();
  });
});

describe("deleteCarFuelLog", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarFuelLog(email, petrolFill.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, petrolFill.id);
  });
});
