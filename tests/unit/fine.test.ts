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

import { createFine, getFines, updateFine, deleteFine } from "@/lib/tracker/fine";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseFine = {
  id: `${email}::fine::1`,
  pk: email,
  type: "fine" as const,
  bikeId,
  fineType: "speeding",
  cost: 100,
  notes: "M1 southbound",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseFine);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseFine);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createFine", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'fine'", async () => {
    await createFine(email, { bikeId, fineType: "speeding", cost: 100, date: "2025-01-01", notes: "M1 southbound" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "fine",
      "fine",
      expect.objectContaining({ fineType: "speeding", cost: 100, notes: "M1 southbound" })
    );
  });

  it("returns the created fine document", async () => {
    const result = await createFine(email, { bikeId, fineType: "speeding", cost: 100, date: "2025-01-01", notes: "M1 southbound" });
    expect(result).toEqual(baseFine);
  });
});

describe("getFines", () => {
  it("queries fines scoped to the given email, type, and bikeId", async () => {
    await getFines(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "fine", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseFine]);
    expect(await getFines(email, bikeId)).toEqual([baseFine]);
  });

  it("returns an empty array when there are no fines", async () => {
    expect(await getFines(email, bikeId)).toEqual([]);
  });
});

describe("updateFine", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateFine(email, baseFine.id, { fineType: "speeding", cost: 120, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseFine.id,
      expect.objectContaining({ cost: 120, notes: "Updated" })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateFine(email, "missing", { fineType: "speeding", cost: 1, date: "2025-01-01", notes: "" })).toBeNull();
  });
});

describe("deleteFine", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteFine(email, baseFine.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseFine.id);
  });
});
