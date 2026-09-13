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

import { createCarToll, getCarTolls, updateCarToll, deleteCarToll } from "@/lib/tracker/carToll";

const email = "driver@example.com";
const carId = "car-1";

const baseToll = {
  id: `${email}::carToll::1`,
  pk: email,
  type: "carToll" as const,
  carId,
  tollType: "dartford-crossing",
  cost: 2.5,
  notes: "",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseToll);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseToll);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarToll", () => {
  it("delegates to createTrackerDoc with idPrefix 'carToll' and type 'carToll'", async () => {
    await createCarToll(email, { carId, tollType: "dartford-crossing", cost: 2.5, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(email, "carToll", "carToll", expect.objectContaining({ tollType: "dartford-crossing", cost: 2.5 }));
  });
});

describe("getCarTolls", () => {
  it("delegates to queryCarTrackerDocs with type 'carToll'", async () => {
    await getCarTolls(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carToll", carId);
  });
});

describe("updateCarToll", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarToll(email, baseToll.id, { tollType: "m6-toll", cost: 6.9, date: "2025-01-02", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseToll.id, expect.objectContaining({ cost: 6.9 }));
  });
});

describe("deleteCarToll", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarToll(email, baseToll.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseToll.id);
  });
});
