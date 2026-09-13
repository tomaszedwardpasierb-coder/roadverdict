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

import { createCarFine, getCarFines, updateCarFine, deleteCarFine } from "@/lib/tracker/carFine";

const email = "driver@example.com";
const carId = "car-1";

const baseFine = {
  id: `${email}::carFine::1`,
  pk: email,
  type: "carFine" as const,
  carId,
  fineType: "speeding",
  cost: 100,
  notes: "",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseFine);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseFine);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarFine", () => {
  it("delegates to createTrackerDoc with idPrefix 'carFine' and type 'carFine'", async () => {
    await createCarFine(email, { carId, fineType: "speeding", cost: 100, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(email, "carFine", "carFine", expect.objectContaining({ fineType: "speeding", cost: 100 }));
  });
});

describe("getCarFines", () => {
  it("delegates to queryCarTrackerDocs with type 'carFine'", async () => {
    await getCarFines(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carFine", carId);
  });
});

describe("updateCarFine", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarFine(email, baseFine.id, { fineType: "speeding", cost: 120, date: "2025-01-02", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseFine.id, expect.objectContaining({ cost: 120 }));
  });
});

describe("deleteCarFine", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarFine(email, baseFine.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseFine.id);
  });
});
