import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  item: vi.fn(),
  read: vi.fn(),
  deleteFn: vi.fn(),
  upsert: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({ getContainer: mocks.getContainer }));

import { getPendingScanBatch, savePendingScanBatch, deletePendingScanBatch, purgeStalePendingScanBatches } from "@/lib/tracker/pendingScanBatch";

const email = "rider@example.com";
const bikeId = "bike-1";
const expectedId = `${email}::pendingScanBatch::${bikeId}`;

const item1 = { fileName: "a.jpg", category: "fuel" } as any;
const item2 = { fileName: "b.jpg", category: "service" } as any;

beforeEach(() => {
  mocks.getContainer.mockReset();
  mocks.item.mockReset();
  mocks.read.mockReset();
  mocks.deleteFn.mockReset();
  mocks.upsert.mockReset();
  mocks.query.mockReset();

  mocks.item.mockReturnValue({ read: mocks.read, delete: mocks.deleteFn });
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
  mocks.getContainer.mockReturnValue({ item: mocks.item, items: { upsert: mocks.upsert, query: mocks.query } });

  mocks.read.mockResolvedValue({ resource: undefined });
  mocks.deleteFn.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue(undefined);
});

describe("getPendingScanBatch", () => {
  it("reads the deterministic id, partitioned by email", async () => {
    await getPendingScanBatch(email, bikeId);
    expect(mocks.item).toHaveBeenCalledWith(expectedId, email);
  });

  it("returns the stored batch document when one exists", async () => {
    const doc = { id: expectedId, pk: email, type: "pendingScanBatch", bikeId, date: "2025-01-01", createdAt: "2025-01-01T00:00:00.000Z", items: [item1] };
    mocks.read.mockResolvedValue({ resource: doc });
    const result = await getPendingScanBatch(email, bikeId);
    expect(result).toEqual(doc);
  });

  it("returns null when no batch is pending", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    const result = await getPendingScanBatch(email, bikeId);
    expect(result).toBeNull();
  });
});

describe("savePendingScanBatch", () => {
  it("upserts a doc with the deterministic id, pk, type, bikeId and items", async () => {
    const doc = await savePendingScanBatch(email, bikeId, [item1, item2]);
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(doc).toMatchObject({ id: expectedId, pk: email, type: "pendingScanBatch", bikeId, items: [item1, item2] });
    expect(mocks.upsert).toHaveBeenCalledWith(doc);
  });

  it("stamps a fresh date/createdAt when no batch existed before", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    const before = Date.now();
    const doc = await savePendingScanBatch(email, bikeId, [item1]);
    const after = Date.now();
    expect(new Date(doc.date).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(doc.date).getTime()).toBeLessThanOrEqual(after);
    expect(new Date(doc.createdAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(doc.createdAt).getTime()).toBeLessThanOrEqual(after);
  });

  // The whole point of this being an upsert rather than a fresh create
  // each time: the batch's own original date/createdAt must survive every
  // subsequent save as the queue works through it item by item, not get
  // reset back to "now" on every partial commit.
  it("preserves the existing batch's original date/createdAt across a re-save, rather than a fresh upsert-of-a-create", async () => {
    mocks.read.mockResolvedValue({
      resource: { id: expectedId, pk: email, type: "pendingScanBatch", bikeId, date: "2025-01-01T00:00:00.000Z", createdAt: "2025-01-01T00:00:00.000Z", items: [item1, item2] },
    });
    const doc = await savePendingScanBatch(email, bikeId, [item2]);
    expect(doc.date).toBe("2025-01-01T00:00:00.000Z");
    expect(doc.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(doc.items).toEqual([item2]);
  });

  it("checks for an existing batch under the same deterministic id before upserting", async () => {
    await savePendingScanBatch(email, bikeId, [item1]);
    expect(mocks.item).toHaveBeenCalledWith(expectedId, email);
    expect(mocks.read).toHaveBeenCalledOnce();
  });
});

describe("deletePendingScanBatch", () => {
  it("deletes the deterministic id, partitioned by email", async () => {
    await deletePendingScanBatch(email, bikeId);
    expect(mocks.item).toHaveBeenCalledWith(expectedId, email);
    expect(mocks.deleteFn).toHaveBeenCalledOnce();
  });

  it("swallows a delete failure (e.g. already gone) rather than throwing", async () => {
    mocks.deleteFn.mockRejectedValue(new Error("404 Not Found"));
    await expect(deletePendingScanBatch(email, bikeId)).resolves.toBeUndefined();
  });
});

describe("purgeStalePendingScanBatches", () => {
  it("deletes docs matched by the query and reports how many succeeded", async () => {
    mocks.query.mockReturnValue({
      fetchAll: () => Promise.resolve({ resources: [{ id: "b1", pk: "a@example.com" }, { id: "b2", pk: "b@example.com" }] }),
    });
    const count = await purgeStalePendingScanBatches();
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
  });

  it("queries by type and a createdAt cutoff, cross-partition", async () => {
    await purgeStalePendingScanBatches();
    const [queryObj] = mocks.query.mock.calls[0];
    expect(queryObj.query).toContain("c.type = 'pendingScanBatch'");
    expect(queryObj.query).toContain("c.createdAt < @cutoff");
  });

  it("is best-effort - one failed delete doesn't stop the rest", async () => {
    mocks.query.mockReturnValue({
      fetchAll: () => Promise.resolve({ resources: [{ id: "b1", pk: "a@example.com" }, { id: "b2", pk: "b@example.com" }] }),
    });
    mocks.deleteFn.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"));
    const count = await purgeStalePendingScanBatches();
    expect(count).toBe(1);
  });

  it("returns 0 when nothing is stale", async () => {
    const count = await purgeStalePendingScanBatches();
    expect(count).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});
