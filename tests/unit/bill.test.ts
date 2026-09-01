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

import { createBill, getBills, updateBill, deleteBill } from "@/lib/tracker/bill";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseBill = {
  id: `${email}::bill::1`,
  pk: email,
  type: "bill" as const,
  bikeId,
  billType: "insurance",
  cost: 120,
  notes: "Annual renewal",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseBill);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseBill);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createBill", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'bill'", async () => {
    await createBill(email, { bikeId, billType: "insurance", cost: 120, date: "2025-01-01", notes: "Annual renewal" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "bill",
      "bill",
      expect.objectContaining({ billType: "insurance", cost: 120, notes: "Annual renewal" })
    );
  });

  it("returns the created bill document", async () => {
    const result = await createBill(email, { bikeId, billType: "insurance", cost: 120, date: "2025-01-01", notes: "Annual renewal" });
    expect(result).toEqual(baseBill);
  });

  it("passes optional fields (mileage, needsReview, currencyConversion, aiDescription) through when supplied", async () => {
    await createBill(email, {
      bikeId,
      billType: "mot-test",
      cost: 54.85,
      date: "2025-01-01",
      notes: "MOT pass",
      mileage: 12345,
      needsReview: true,
      aiDescription: "MOT test at Dave's Garage (MOT)",
      currencyConversion: { originalCurrency: "EUR", originalAmount: 60, rate: 0.86, ratedAt: "2025-01-01" },
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.mileage).toBe(12345);
    expect(payload.needsReview).toBe(true);
    expect(payload.aiDescription).toBe("MOT test at Dave's Garage (MOT)");
    expect(payload.currencyConversion).toEqual({ originalCurrency: "EUR", originalAmount: 60, rate: 0.86, ratedAt: "2025-01-01" });
  });
});

describe("getBills", () => {
  it("queries bills scoped to the given email, type, and bikeId", async () => {
    await getBills(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "bill", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseBill]);
    expect(await getBills(email, bikeId)).toEqual([baseBill]);
  });

  it("returns an empty array when there are no bills", async () => {
    expect(await getBills(email, bikeId)).toEqual([]);
  });
});

describe("updateBill", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateBill(email, baseBill.id, { billType: "insurance", cost: 130, date: "2025-02-01", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseBill.id,
      expect.objectContaining({ billType: "insurance", cost: 130, notes: "Updated" })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateBill(email, "missing", { billType: "insurance", cost: 130, date: "2025-02-01", notes: "Updated" })).toBeNull();
  });

  it("returns the updated document on success", async () => {
    const updated = { ...baseBill, cost: 130 };
    mocks.updateTrackerDoc.mockResolvedValue(updated);
    expect(await updateBill(email, baseBill.id, { billType: "insurance", cost: 130, date: "2025-01-01", notes: "Annual renewal" })).toEqual(updated);
  });

  it("passes the optional mileage field through on update", async () => {
    await updateBill(email, baseBill.id, { billType: "mot-test", cost: 54.85, date: "2025-01-01", notes: "MOT pass", mileage: 20000 });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileage).toBe(20000);
  });
});

describe("deleteBill", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteBill(email, baseBill.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseBill.id);
  });
});
