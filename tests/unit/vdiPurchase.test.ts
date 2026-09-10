import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: () => ({ read: mocks.read }), items: { upsert: mocks.upsert } }),
}));

import { createVdiPurchase, getVdiPurchase, markVdiPurchasePaid, markVdiPurchaseConsumed } from "@/lib/tracker/vdiPurchase";

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
});

describe("createVdiPurchase", () => {
  it("creates a pending, single-partition doc bound to the given email/vrm/vehicleKind", async () => {
    const doc = await createVdiPurchase("buyer@example.com", "AB12CDE", "bike");
    expect(doc.email).toBe("buyer@example.com");
    expect(doc.vrm).toBe("AB12CDE");
    expect(doc.vehicleKind).toBe("bike");
    expect(doc.status).toBe("pending");
    expect(doc.id).toBe(doc.pk);
    expect(typeof doc.id).toBe("string");
    expect(doc.id.length).toBeGreaterThan(10);
    expect(mocks.upsert).toHaveBeenCalledWith(doc);
  });

  it("generates a different id on every call", async () => {
    const first = await createVdiPurchase("a@example.com", "AB12CDE", "bike");
    const second = await createVdiPurchase("a@example.com", "AB12CDE", "bike");
    expect(first.id).not.toBe(second.id);
  });
});

describe("getVdiPurchase", () => {
  it("returns the doc when it exists", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "p1", pk: "p1", type: "vdiPurchase", status: "paid" } });
    await expect(getVdiPurchase("p1")).resolves.toEqual({ id: "p1", pk: "p1", type: "vdiPurchase", status: "paid" });
  });

  it("returns null when no doc exists", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(getVdiPurchase("missing")).resolves.toBeNull();
  });

  it("fails soft to null when the read itself throws", async () => {
    mocks.read.mockRejectedValue(new Error("cosmos down"));
    await expect(getVdiPurchase("p1")).resolves.toBeNull();
  });
});

describe("markVdiPurchasePaid", () => {
  it("transitions a pending purchase to paid and records the Stripe session id", async () => {
    const resource = { id: "p1", pk: "p1", type: "vdiPurchase", email: "a@example.com", vrm: "AB12CDE", vehicleKind: "bike", createdAt: "x", status: "pending" };
    mocks.read.mockResolvedValue({ resource });
    const result = await markVdiPurchasePaid("p1", "cs_1");
    expect(result?.status).toBe("paid");
    expect(result?.stripeSessionId).toBe("cs_1");
    expect(result?.paidAt).toBeDefined();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: "paid", stripeSessionId: "cs_1" }));
  });

  it("is idempotent - does not regress an already-consumed purchase back to paid", async () => {
    const resource = { id: "p1", pk: "p1", type: "vdiPurchase", email: "a@example.com", vrm: "AB12CDE", vehicleKind: "bike", createdAt: "x", status: "consumed", consumedAt: "y" };
    mocks.read.mockResolvedValue({ resource });
    const result = await markVdiPurchasePaid("p1", "cs_1");
    expect(result?.status).toBe("consumed");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns null when the purchase doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await markVdiPurchasePaid("missing", "cs_1")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("markVdiPurchaseConsumed", () => {
  it("marks a paid purchase consumed", async () => {
    const resource = { id: "p1", pk: "p1", type: "vdiPurchase", email: "a@example.com", vrm: "AB12CDE", vehicleKind: "bike", createdAt: "x", status: "paid" };
    mocks.read.mockResolvedValue({ resource });
    await markVdiPurchaseConsumed("p1");
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: "consumed", consumedAt: expect.any(String) }));
  });

  it("does nothing when the purchase doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await markVdiPurchaseConsumed("missing");
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
