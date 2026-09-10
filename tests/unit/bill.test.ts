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

import { createBill, getBills, updateBill, deleteBill, logVedBillIfNeeded } from "@/lib/tracker/bill";
import type { VehicleTaxDetails } from "@/lib/tracker/vehicleTaxFetch";

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

describe("logVedBillIfNeeded", () => {
  const taxedDetails: VehicleTaxDetails = {
    make: "Honda",
    taxStatus: "Taxed",
    taxIsCurrentlyValid: true,
    taxDueDate: "2025-07-01",
    taxDaysRemaining: 300,
    motStatus: "Valid",
    vedStandardTwelveMonths: 117,
  };

  it("does nothing when taxDetails is null", async () => {
    expect(await logVedBillIfNeeded(email, bikeId, null)).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("does nothing when the vehicle isn't currently taxed", async () => {
    const sorned: VehicleTaxDetails = { ...taxedDetails, taxIsCurrentlyValid: false, taxStatus: "SORN" };
    expect(await logVedBillIfNeeded(email, bikeId, sorned)).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("does nothing when there's no taxDueDate to anchor a period to", async () => {
    const noDueDate: VehicleTaxDetails = { ...taxedDetails, taxDueDate: null };
    expect(await logVedBillIfNeeded(email, bikeId, noDueDate)).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("creates a road-tax bill for the inferred period when none exists yet", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    const created = await logVedBillIfNeeded(email, bikeId, taxedDetails);
    expect(created).toBe(true);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "bill",
      "bill",
      expect.objectContaining({ bikeId, billType: "road-tax", cost: 117, date: "2024-07-01" })
    );
  });

  it("does not duplicate a bill already logged for the same inferred period", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseBill, billType: "road-tax", date: "2024-07-01" },
    ]);
    const created = await logVedBillIfNeeded(email, bikeId, taxedDetails);
    expect(created).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("logs a new bill once taxDueDate rolls over to the next period", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseBill, billType: "road-tax", date: "2024-07-01" },
    ]);
    const nextPeriod: VehicleTaxDetails = { ...taxedDetails, taxDueDate: "2026-07-01" };
    const created = await logVedBillIfNeeded(email, bikeId, nextPeriod);
    expect(created).toBe(true);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "bill",
      "bill",
      expect.objectContaining({ billType: "road-tax", date: "2025-07-01" })
    );
  });

  it("falls back to a cost of 0 when vedStandardTwelveMonths is null", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([]);
    const noRate: VehicleTaxDetails = { ...taxedDetails, vedStandardTwelveMonths: null };
    await logVedBillIfNeeded(email, bikeId, noRate);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "bill",
      "bill",
      expect.objectContaining({ cost: 0 })
    );
  });
});
