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
// queryCarTrackerDocs lives in car.ts, not cosmosHelpers.ts (see that
// file's own comment on why) - mocked separately from the above.
vi.mock("@/lib/tracker/car", () => ({ queryCarTrackerDocs: mocks.queryCarTrackerDocs }));

import { createCarServiceRecord, getCarServiceRecords, updateCarServiceRecord, deleteCarServiceRecord } from "@/lib/tracker/carServiceRecord";

const email = "driver@example.com";
const carId = "car-1";

const baseRecord = {
  id: `${email}::carService::1`,
  pk: email,
  type: "carServiceRecord" as const,
  carId,
  jobType: "cambelt",
  cost: 350,
  mileage: 42000,
  notes: "Cambelt and water pump",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseRecord);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseRecord);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarServiceRecord", () => {
  it("delegates to the existing, unmodified createTrackerDoc with idPrefix 'carService' and type 'carServiceRecord'", async () => {
    await createCarServiceRecord(email, { carId, jobType: "cambelt", cost: 350, mileage: 42000, date: "2025-01-01", notes: "Cambelt and water pump" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "carService",
      "carServiceRecord",
      expect.objectContaining({ carId, jobType: "cambelt", cost: 350, mileage: 42000 })
    );
  });

  it("returns the created record", async () => {
    const result = await createCarServiceRecord(email, { carId, jobType: "cambelt", cost: 350, mileage: 42000, date: "2025-01-01", notes: "Cambelt and water pump" });
    expect(result).toEqual(baseRecord);
  });
});

describe("getCarServiceRecords", () => {
  it("delegates to queryCarTrackerDocs (not queryTrackerDocs) with type 'carServiceRecord' and the given carId", async () => {
    await getCarServiceRecords(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carServiceRecord", carId);
  });

  it("returns the query results", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([baseRecord]);
    expect(await getCarServiceRecords(email, carId)).toEqual([baseRecord]);
  });
});

describe("updateCarServiceRecord", () => {
  it("delegates to the existing updateTrackerDoc with the email, id, and data", async () => {
    await updateCarServiceRecord(email, baseRecord.id, { jobType: "cambelt", cost: 375, mileage: 42500, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseRecord.id, expect.objectContaining({ cost: 375, mileage: 42500 }));
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateCarServiceRecord(email, "missing", { jobType: "x", cost: 1, mileage: 1, date: "2025-01-01", notes: "" })).toBeNull();
  });

  it("allows explicitly clearing mileageConflictWarning by passing null", async () => {
    await updateCarServiceRecord(email, baseRecord.id, { jobType: "cambelt", cost: 350, mileage: 42000, date: "2025-01-01", notes: "", mileageConflictWarning: null });
    expect(mocks.updateTrackerDoc.mock.calls[0][2].mileageConflictWarning).toBeNull();
  });
});

describe("deleteCarServiceRecord", () => {
  it("delegates to the existing deleteTrackerDoc with email and id", async () => {
    await deleteCarServiceRecord(email, baseRecord.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseRecord.id);
  });
});
