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

import { createCarMod, getCarMods, updateCarMod, deleteCarMod } from "@/lib/tracker/carMod";

const email = "driver@example.com";
const carId = "car-1";

const baseMod = {
  id: `${email}::carMod::1`,
  pk: email,
  type: "carMod" as const,
  carId,
  category: "dash-cam",
  name: "Nextbase 622GW",
  cost: 180,
  mileage: 12000,
  notes: "",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseMod);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseMod);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarMod", () => {
  it("delegates to createTrackerDoc with idPrefix 'carMod' and type 'carMod'", async () => {
    await createCarMod(email, { carId, category: "dash-cam", name: "Nextbase 622GW", cost: 180, mileage: 12000, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(email, "carMod", "carMod", expect.objectContaining({ category: "dash-cam", name: "Nextbase 622GW" }));
  });
});

describe("getCarMods", () => {
  it("delegates to queryCarTrackerDocs with type 'carMod'", async () => {
    await getCarMods(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carMod", carId);
  });
});

describe("updateCarMod", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarMod(email, baseMod.id, { category: "dash-cam", name: "Nextbase 622GW", cost: 190, mileage: 12100, date: "2025-01-02", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseMod.id, expect.objectContaining({ cost: 190 }));
  });
});

describe("deleteCarMod", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarMod(email, baseMod.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseMod.id);
  });
});
