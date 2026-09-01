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

import { createMod, getMods, updateMod, deleteMod } from "@/lib/tracker/mod";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseMod = {
  id: `${email}::mod::1`,
  pk: email,
  type: "mod" as const,
  bikeId,
  category: "exhaust",
  name: "Akrapovic slip-on",
  cost: 450,
  mileage: 8000,
  notes: "Sounds great",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseMod);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseMod);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createMod", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'mod'", async () => {
    await createMod(email, { bikeId, category: "exhaust", name: "Akrapovic slip-on", cost: 450, mileage: 8000, date: "2025-01-01", notes: "Sounds great" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "mod",
      "mod",
      expect.objectContaining({ category: "exhaust", name: "Akrapovic slip-on", cost: 450, mileage: 8000 })
    );
  });

  it("returns the created mod document", async () => {
    const result = await createMod(email, { bikeId, category: "exhaust", name: "Akrapovic slip-on", cost: 450, mileage: 8000, date: "2025-01-01", notes: "Sounds great" });
    expect(result).toEqual(baseMod);
  });

  it("passes optional fields (needsReview, mileageConfidence, aiDescription, mileageConflictWarning) through when supplied", async () => {
    await createMod(email, {
      bikeId,
      category: "exhaust",
      name: "Akrapovic slip-on",
      cost: 450,
      mileage: 8000,
      date: "2025-01-01",
      notes: "Sounds great",
      needsReview: true,
      mileageConfidence: "estimated",
      aiDescription: "Exhaust upgrade at Dave's (Mods)",
      mileageConflictWarning: "Mileage lower than a previous record",
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.needsReview).toBe(true);
    expect(payload.mileageConfidence).toBe("estimated");
    expect(payload.aiDescription).toBe("Exhaust upgrade at Dave's (Mods)");
    expect(payload.mileageConflictWarning).toBe("Mileage lower than a previous record");
  });
});

describe("getMods", () => {
  it("queries mods scoped to the given email, type, and bikeId", async () => {
    await getMods(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "mod", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseMod]);
    expect(await getMods(email, bikeId)).toEqual([baseMod]);
  });

  it("returns an empty array when there are no mods", async () => {
    expect(await getMods(email, bikeId)).toEqual([]);
  });
});

describe("updateMod", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateMod(email, baseMod.id, { category: "exhaust", name: "Akrapovic slip-on", cost: 475, mileage: 8200, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseMod.id,
      expect.objectContaining({ cost: 475, mileage: 8200, notes: "Updated" })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateMod(email, "missing", { category: "exhaust", name: "x", cost: 1, mileage: 1, date: "2025-01-01", notes: "" })).toBeNull();
  });

  it("allows explicitly clearing mileageConflictWarning by passing null", async () => {
    await updateMod(email, baseMod.id, { category: "exhaust", name: "Akrapovic slip-on", cost: 450, mileage: 8000, date: "2025-01-01", notes: "Sounds great", mileageConflictWarning: null });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileageConflictWarning).toBeNull();
  });
});

describe("deleteMod", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteMod(email, baseMod.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseMod.id);
  });
});
