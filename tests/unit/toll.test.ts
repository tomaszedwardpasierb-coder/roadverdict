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

import { createToll, getTolls, updateToll, deleteToll } from "@/lib/tracker/toll";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseToll = {
  id: `${email}::toll::1`,
  pk: email,
  type: "toll" as const,
  bikeId,
  tollType: "dartford-crossing",
  cost: 2.5,
  notes: "",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseToll);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseToll);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createToll", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'toll'", async () => {
    await createToll(email, { bikeId, tollType: "dartford-crossing", cost: 2.5, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "toll",
      "toll",
      expect.objectContaining({ tollType: "dartford-crossing", cost: 2.5 })
    );
  });

  it("returns the created toll document", async () => {
    const result = await createToll(email, { bikeId, tollType: "dartford-crossing", cost: 2.5, date: "2025-01-01", notes: "" });
    expect(result).toEqual(baseToll);
  });
});

describe("getTolls", () => {
  it("queries tolls scoped to the given email, type, and bikeId", async () => {
    await getTolls(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "toll", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseToll]);
    expect(await getTolls(email, bikeId)).toEqual([baseToll]);
  });

  it("returns an empty array when there are no tolls", async () => {
    expect(await getTolls(email, bikeId)).toEqual([]);
  });
});

describe("updateToll", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateToll(email, baseToll.id, { tollType: "m6-toll", cost: 6.9, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseToll.id,
      expect.objectContaining({ cost: 6.9, notes: "Updated" })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateToll(email, "missing", { tollType: "ulez", cost: 1, date: "2025-01-01", notes: "" })).toBeNull();
  });
});

describe("deleteToll", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteToll(email, baseToll.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseToll.id);
  });
});
