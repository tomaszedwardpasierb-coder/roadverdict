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

import { createLabour, getLabour, updateLabour, deleteLabour } from "@/lib/tracker/labour";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseLabour = {
  id: `${email}::labour::1`,
  pk: email,
  type: "labour" as const,
  bikeId,
  category: "brake-bleeding",
  cost: 45,
  mileage: 8000,
  notes: "Front brake bleed",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseLabour);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseLabour);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createLabour", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'labour'", async () => {
    await createLabour(email, { bikeId, category: "brake-bleeding", cost: 45, mileage: 8000, date: "2025-01-01", notes: "Front brake bleed" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "labour",
      "labour",
      expect.objectContaining({ category: "brake-bleeding", cost: 45, mileage: 8000 })
    );
  });

  it("returns the created labour document", async () => {
    const result = await createLabour(email, { bikeId, category: "brake-bleeding", cost: 45, mileage: 8000, date: "2025-01-01", notes: "Front brake bleed" });
    expect(result).toEqual(baseLabour);
  });

  it("passes optional fields (needsReview, mileageConfidence, aiDescription, mileageConflictWarning) through when supplied", async () => {
    await createLabour(email, {
      bikeId,
      category: "brake-bleeding",
      cost: 45,
      mileage: 8000,
      date: "2025-01-01",
      notes: "Front brake bleed",
      needsReview: true,
      mileageConfidence: "estimated",
      aiDescription: "Workshop invoice (Labour)",
      mileageConflictWarning: "Mileage lower than a previous record",
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.needsReview).toBe(true);
    expect(payload.mileageConfidence).toBe("estimated");
    expect(payload.aiDescription).toBe("Workshop invoice (Labour)");
    expect(payload.mileageConflictWarning).toBe("Mileage lower than a previous record");
  });
});

describe("getLabour", () => {
  it("queries labour scoped to the given email, type, and bikeId", async () => {
    await getLabour(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "labour", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseLabour]);
    expect(await getLabour(email, bikeId)).toEqual([baseLabour]);
  });

  it("returns an empty array when there is no labour logged", async () => {
    expect(await getLabour(email, bikeId)).toEqual([]);
  });
});

describe("updateLabour", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateLabour(email, baseLabour.id, { category: "brake-bleeding", cost: 50, mileage: 8200, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseLabour.id,
      expect.objectContaining({ cost: 50, mileage: 8200, notes: "Updated" })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateLabour(email, "missing", { category: "other", cost: 1, mileage: 1, date: "2025-01-01", notes: "" })).toBeNull();
  });

  it("allows explicitly clearing mileageConflictWarning by passing null", async () => {
    await updateLabour(email, baseLabour.id, { category: "brake-bleeding", cost: 45, mileage: 8000, date: "2025-01-01", notes: "Front brake bleed", mileageConflictWarning: null });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileageConflictWarning).toBeNull();
  });
});

describe("deleteLabour", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteLabour(email, baseLabour.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseLabour.id);
  });
});
