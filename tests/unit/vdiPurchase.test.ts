import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn(), fetchAll: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: mocks.read }),
    items: {
      upsert: mocks.upsert,
      query: (queryObj: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj) }),
    },
  }),
}));

import {
  createVdiPurchase,
  getVdiPurchase,
  markVdiPurchasePaid,
  markVdiPurchaseConsumed,
  findRecentConsumedPurchase,
  VDI_PURCHASE_RETRIEVAL_WINDOW_MS,
} from "@/lib/tracker/vdiPurchase";

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
  mocks.fetchAll.mockReset();
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

const sampleVdiCheck = {
  isStolen: false, hasWriteOffRecord: false, writeOffRecordCount: 0, hasOutstandingFinance: false, financeRecords: [],
  keeperChanges: [], keeperChangeCount: 0, plateChangeCount: 0, colourChangeCount: 0, currentColour: null,
  vedFirstYearTwelveMonths: null, vedStandardTwelveMonths: null, v5cReissueCount: 0,
  calculatedAverageAnnualMileage: null, averageMileageForAge: null, mileageAnomalyDetected: false,
  manufacturerWarrantyMiles: null, manufacturerWarrantyMonths: null,
};

describe("markVdiPurchaseConsumed", () => {
  it("marks a paid purchase consumed and caches the fetched VDI check on the doc", async () => {
    const resource = { id: "p1", pk: "p1", type: "vdiPurchase", email: "a@example.com", vrm: "AB12CDE", vehicleKind: "bike", createdAt: "x", status: "paid" };
    mocks.read.mockResolvedValue({ resource });
    await markVdiPurchaseConsumed("p1", sampleVdiCheck);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: "consumed", consumedAt: expect.any(String), vdiCheck: sampleVdiCheck }));
  });

  it("does nothing when the purchase doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await markVdiPurchaseConsumed("missing", sampleVdiCheck);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("findRecentConsumedPurchase", () => {
  it("returns null when no consumed purchase exists for this plate", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await findRecentConsumedPurchase("a@example.com", "AB12CDE", "bike")).toBeNull();
  });

  it("returns the most recent matching purchase, filtered to email/vrm/vehicleKind/status/window server-side", async () => {
    const consumed = { id: "p1", pk: "p1", type: "vdiPurchase", email: "a@example.com", vrm: "AB12CDE", vehicleKind: "bike", createdAt: "x", status: "consumed", consumedAt: "2026-01-01T00:00:00.000Z", vdiCheck: sampleVdiCheck };
    mocks.fetchAll.mockResolvedValue({ resources: [consumed] });

    const result = await findRecentConsumedPurchase("a@example.com", "AB12CDE", "bike");

    expect(result).toEqual(consumed);
    const queryObj = mocks.fetchAll.mock.calls[0][0] as { query: string; parameters: { name: string; value: unknown }[] };
    expect(queryObj.query).toContain("c.status = 'consumed'");
    expect(queryObj.parameters).toEqual(
      expect.arrayContaining([
        { name: "@email", value: "a@example.com" },
        { name: "@vrm", value: "AB12CDE" },
        { name: "@vehicleKind", value: "bike" },
      ])
    );
  });

  it("passes a cutoff timestamp roughly VDI_PURCHASE_RETRIEVAL_WINDOW_MS in the past", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    const before = Date.now();

    await findRecentConsumedPurchase("a@example.com", "AB12CDE", "bike");

    const queryObj = mocks.fetchAll.mock.calls[0][0] as { parameters: { name: string; value: string }[] };
    const cutoffParam = queryObj.parameters.find((p) => p.name === "@cutoff")!;
    const expectedCutoffMs = before - VDI_PURCHASE_RETRIEVAL_WINDOW_MS;
    expect(new Date(cutoffParam.value).getTime()).toBeGreaterThanOrEqual(expectedCutoffMs - 1000);
    expect(new Date(cutoffParam.value).getTime()).toBeLessThanOrEqual(expectedCutoffMs + 1000);
  });
});
