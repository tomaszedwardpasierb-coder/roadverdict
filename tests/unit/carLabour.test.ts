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

import { createCarLabour, getCarLabour, updateCarLabour, deleteCarLabour } from "@/lib/tracker/carLabour";

const email = "driver@example.com";
const carId = "car-1";

const baseLabour = {
  id: `${email}::carLabour::1`,
  pk: email,
  type: "carLabour" as const,
  carId,
  category: "hv-battery-health-check",
  cost: 60,
  mileage: 12000,
  notes: "",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseLabour);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseLabour);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarLabour", () => {
  it("delegates to createTrackerDoc with idPrefix 'carLabour' and type 'carLabour'", async () => {
    await createCarLabour(email, { carId, category: "hv-battery-health-check", cost: 60, mileage: 12000, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(email, "carLabour", "carLabour", expect.objectContaining({ category: "hv-battery-health-check", cost: 60 }));
  });
});

describe("getCarLabour", () => {
  it("delegates to queryCarTrackerDocs with type 'carLabour'", async () => {
    await getCarLabour(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carLabour", carId);
  });
});

describe("updateCarLabour", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarLabour(email, baseLabour.id, { category: "hv-battery-health-check", cost: 65, mileage: 12100, date: "2025-01-02", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseLabour.id, expect.objectContaining({ cost: 65 }));
  });
});

describe("deleteCarLabour", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarLabour(email, baseLabour.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseLabour.id);
  });
});
