import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  query: vi.fn(),
  item: vi.fn(),
  read: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { upsert: mocks.upsert, query: mocks.query },
    item: mocks.item,
  }),
}));

import {
  createTrackerDoc,
  copyTrackerDoc,
  queryTrackerDocs,
  updateTrackerDoc,
  deleteTrackerDoc,
  getTrackerDocById,
} from "@/lib/tracker/cosmosHelpers";

const email = "rider@example.com";

const existingDoc = {
  id: `${email}::sr::1`,
  pk: email,
  type: "service",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
  bikeId: "bike-1",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.upsert.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
  mocks.item.mockReturnValue({ read: mocks.read, delete: mocks.delete });
  mocks.read.mockResolvedValue({ resource: null });
  mocks.delete.mockResolvedValue(undefined);
});

describe("createTrackerDoc", () => {
  it("upserts the new document", async () => {
    await createTrackerDoc(email, "sr", "service", { date: "2025-01-01", bikeId: "bike-1" } as any);
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("generates id with email::prefix::timestamp pattern", async () => {
    await createTrackerDoc(email, "sr", "service", { date: "2025-01-01", bikeId: "bike-1" } as any);
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.id).toMatch(new RegExp(`^${email.replace(/[@.]/g, "\\$&")}::sr::`));
  });

  it("sets pk to email", async () => {
    await createTrackerDoc(email, "sr", "service", { date: "2025-01-01", bikeId: "bike-1" } as any);
    expect(mocks.upsert.mock.calls[0][0].pk).toBe(email);
  });

  it("sets type from the type argument", async () => {
    await createTrackerDoc(email, "sr", "service", { date: "2025-01-01", bikeId: "bike-1" } as any);
    expect(mocks.upsert.mock.calls[0][0].type).toBe("service");
  });

  it("sets createdAt to a current ISO timestamp", async () => {
    const before = Date.now();
    await createTrackerDoc(email, "sr", "service", { date: "2025-01-01", bikeId: "bike-1" } as any);
    const after = Date.now();
    const ts = new Date(mocks.upsert.mock.calls[0][0].createdAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("spreads the data payload into the document", async () => {
    await createTrackerDoc(email, "sr", "service", { date: "2025-06-01", bikeId: "bike-1", cost: 45 } as any);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ date: "2025-06-01", cost: 45 });
  });

  it("returns the created document", async () => {
    const result = await createTrackerDoc(email, "sr", "service", { date: "2025-01-01", bikeId: "bike-1" } as any);
    expect(result).toEqual(mocks.upsert.mock.calls[0][0]);
  });
});

describe("copyTrackerDoc", () => {
  it("upserts the copy", async () => {
    await copyTrackerDoc(existingDoc as any, "sr", "buyer@example.com", "new-bike-id");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("sets pk to the new owner email", async () => {
    await copyTrackerDoc(existingDoc as any, "sr", "buyer@example.com", "new-bike-id");
    expect(mocks.upsert.mock.calls[0][0].pk).toBe("buyer@example.com");
  });

  it("sets bikeId to the new bike id", async () => {
    await copyTrackerDoc(existingDoc as any, "sr", "buyer@example.com", "new-bike-id");
    expect(mocks.upsert.mock.calls[0][0].bikeId).toBe("new-bike-id");
  });

  it("generates a new unique id distinct from the original", async () => {
    await copyTrackerDoc(existingDoc as any, "sr", "buyer@example.com", "new-bike-id");
    const copiedId = mocks.upsert.mock.calls[0][0].id;
    expect(copiedId).not.toBe(existingDoc.id);
  });

  it("applies overrides over the copied fields", async () => {
    await copyTrackerDoc(existingDoc as any, "sr", "buyer@example.com", "new-bike-id", { notifiedAt: null } as any);
    expect(mocks.upsert.mock.calls[0][0].notifiedAt).toBeNull();
  });

  it("preserves fields from the original that are not overridden", async () => {
    await copyTrackerDoc(existingDoc as any, "sr", "buyer@example.com", "new-bike-id");
    expect(mocks.upsert.mock.calls[0][0].type).toBe("service");
    expect(mocks.upsert.mock.calls[0][0].date).toBe("2025-01-01");
  });
});

describe("queryTrackerDocs", () => {
  it("returns query results", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [existingDoc] }) });
    const result = await queryTrackerDocs(email, "service", "bike-1");
    expect(result).toEqual([existingDoc]);
  });

  it("returns empty array when no results", async () => {
    const result = await queryTrackerDocs(email, "service", "bike-1");
    expect(result).toEqual([]);
  });
});

describe("updateTrackerDoc", () => {
  it("returns null when the document does not exist", async () => {
    const result = await updateTrackerDoc(email, "nonexistent-id", { date: "2025-02-01" } as any);
    expect(result).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("merges updates into the existing document and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    await updateTrackerDoc(email, existingDoc.id, { date: "2025-06-01" } as any);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.upsert.mock.calls[0][0].date).toBe("2025-06-01");
  });

  it("preserves fields not present in the updates", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    await updateTrackerDoc(email, existingDoc.id, { date: "2025-06-01" } as any);
    expect(mocks.upsert.mock.calls[0][0].type).toBe("service");
  });

  it("returns the updated document", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    const result = await updateTrackerDoc(email, existingDoc.id, { date: "2025-06-01" } as any);
    expect(result?.date).toBe("2025-06-01");
  });

  it("reads using the correct item(id, email) call", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    await updateTrackerDoc(email, existingDoc.id, {});
    expect(mocks.item).toHaveBeenCalledWith(existingDoc.id, email);
  });
});

describe("deleteTrackerDoc", () => {
  it("calls delete on the correct item", async () => {
    await deleteTrackerDoc(email, existingDoc.id);
    expect(mocks.item).toHaveBeenCalledWith(existingDoc.id, email);
    expect(mocks.delete).toHaveBeenCalledOnce();
  });
});

describe("getTrackerDocById", () => {
  it("returns the document when found", async () => {
    mocks.read.mockResolvedValue({ resource: existingDoc });
    const result = await getTrackerDocById(email, existingDoc.id);
    expect(result).toEqual(existingDoc);
  });

  it("returns null when the document does not exist", async () => {
    const result = await getTrackerDocById(email, "nonexistent-id");
    expect(result).toBeNull();
  });

  it("reads using the correct item(id, email) call", async () => {
    mocks.read.mockResolvedValue({ resource: existingDoc });
    await getTrackerDocById(email, existingDoc.id);
    expect(mocks.item).toHaveBeenCalledWith(existingDoc.id, email);
  });
});
