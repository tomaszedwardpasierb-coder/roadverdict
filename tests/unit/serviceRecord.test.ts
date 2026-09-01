import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  queryTrackerDocs: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
}));

vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  queryTrackerDocs: mocks.queryTrackerDocs,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));

import { createServiceRecord, getServiceRecords, updateServiceRecord, deleteServiceRecord } from "@/lib/tracker/serviceRecord";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseRecord = {
  id: `${email}::service::1`,
  pk: email,
  type: "serviceRecord" as const,
  bikeId,
  jobType: "Oil change",
  cost: 80,
  mileage: 12000,
  notes: "Full synthetic",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseRecord);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseRecord);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createServiceRecord", () => {
  // idPrefix ("service") and type ("serviceRecord") deliberately differ
  // here, unlike bill/mod - pin both distinctly so a future refactor that
  // accidentally aligns them (breaking id generation or the query type
  // filter) gets caught.
  it("delegates to createTrackerDoc with idPrefix 'service' and type 'serviceRecord'", async () => {
    await createServiceRecord(email, { bikeId, jobType: "Oil change", cost: 80, mileage: 12000, date: "2025-01-01", notes: "Full synthetic" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "service",
      "serviceRecord",
      expect.objectContaining({ jobType: "Oil change", cost: 80, mileage: 12000 })
    );
  });

  it("returns the created service record document", async () => {
    const result = await createServiceRecord(email, { bikeId, jobType: "Oil change", cost: 80, mileage: 12000, date: "2025-01-01", notes: "Full synthetic" });
    expect(result).toEqual(baseRecord);
  });

  it("passes optional fields (needsReview, mileageConfidence, aiDescription, mileageConflictWarning) through when supplied", async () => {
    await createServiceRecord(email, {
      bikeId,
      jobType: "Oil change",
      cost: 80,
      mileage: 12000,
      date: "2025-01-01",
      notes: "Full synthetic",
      needsReview: true,
      mileageConfidence: "interpolated",
      aiDescription: "Oil change at Dave's Garage (Service)",
      mileageConflictWarning: "Mileage lower than a previous record",
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.needsReview).toBe(true);
    expect(payload.mileageConfidence).toBe("interpolated");
    expect(payload.aiDescription).toBe("Oil change at Dave's Garage (Service)");
    expect(payload.mileageConflictWarning).toBe("Mileage lower than a previous record");
  });
});

describe("getServiceRecords", () => {
  it("queries service records scoped to the given email, type 'serviceRecord', and bikeId", async () => {
    await getServiceRecords(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "serviceRecord", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseRecord]);
    expect(await getServiceRecords(email, bikeId)).toEqual([baseRecord]);
  });

  it("returns an empty array when there are no service records", async () => {
    expect(await getServiceRecords(email, bikeId)).toEqual([]);
  });
});

describe("updateServiceRecord", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateServiceRecord(email, baseRecord.id, { jobType: "Oil change", cost: 85, mileage: 12500, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseRecord.id,
      expect.objectContaining({ cost: 85, mileage: 12500, notes: "Updated" })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateServiceRecord(email, "missing", { jobType: "x", cost: 1, mileage: 1, date: "2025-01-01", notes: "" })).toBeNull();
  });

  it("allows explicitly clearing mileageConflictWarning by passing null", async () => {
    await updateServiceRecord(email, baseRecord.id, { jobType: "Oil change", cost: 80, mileage: 12000, date: "2025-01-01", notes: "Full synthetic", mileageConflictWarning: null });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileageConflictWarning).toBeNull();
  });

  it("can promote mileageConfidence to 'confirmed' on a manual re-save", async () => {
    await updateServiceRecord(email, baseRecord.id, { jobType: "Oil change", cost: 80, mileage: 12000, date: "2025-01-01", notes: "Full synthetic", mileageConfidence: "confirmed" });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileageConfidence).toBe("confirmed");
  });
});

describe("deleteServiceRecord", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteServiceRecord(email, baseRecord.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseRecord.id);
  });
});
