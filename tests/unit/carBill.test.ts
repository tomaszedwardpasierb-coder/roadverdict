import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
  queryCarTrackerDocs: vi.fn(),
}));

vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));
vi.mock("@/lib/tracker/car", () => ({ queryCarTrackerDocs: mocks.queryCarTrackerDocs }));

import { createCarBill, getCarBills, updateCarBill, deleteCarBill, logVedCarBillIfNeeded } from "@/lib/tracker/carBill";
import type { VehicleTaxDetails } from "@/lib/tracker/vehicleTaxFetch";

const email = "driver@example.com";
const carId = "car-1";

const baseBill = {
  id: `${email}::carBill::1`,
  pk: email,
  type: "carBill" as const,
  carId,
  billType: "ulez-caz",
  cost: 12.5,
  notes: "",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseBill);
  mocks.queryCarTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseBill);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createCarBill", () => {
  it("delegates to createTrackerDoc with idPrefix 'carBill' and type 'carBill'", async () => {
    await createCarBill(email, { carId, billType: "ulez-caz", cost: 12.5, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(email, "carBill", "carBill", expect.objectContaining({ billType: "ulez-caz", cost: 12.5 }));
  });

  // ULEZ/Congestion have no motorcycle equivalent at all - this is the
  // whole reason CAR_ONLY_BILL_LABELS exists (see carBillTypes.ts).
  it("logs a car-only bill type with no motorcycle equivalent", async () => {
    await createCarBill(email, { carId, billType: "congestion", cost: 15, date: "2025-01-01", notes: "" });
    expect(mocks.createTrackerDoc.mock.calls[0][3].billType).toBe("congestion");
  });
});

describe("getCarBills", () => {
  it("delegates to queryCarTrackerDocs with type 'carBill'", async () => {
    await getCarBills(email, carId);
    expect(mocks.queryCarTrackerDocs).toHaveBeenCalledWith(email, "carBill", carId);
  });
});

describe("updateCarBill", () => {
  it("delegates to updateTrackerDoc", async () => {
    await updateCarBill(email, baseBill.id, { billType: "ulez-caz", cost: 12.5, date: "2025-01-02", notes: "Updated" });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseBill.id, expect.objectContaining({ notes: "Updated" }));
  });
});

describe("deleteCarBill", () => {
  it("delegates to deleteTrackerDoc", async () => {
    await deleteCarBill(email, baseBill.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseBill.id);
  });
});

describe("logVedCarBillIfNeeded", () => {
  const taxedDetails: VehicleTaxDetails = {
    make: "Ford",
    taxStatus: "Taxed",
    taxIsCurrentlyValid: true,
    taxDueDate: "2025-07-01",
    taxDaysRemaining: 300,
    motStatus: "Valid",
    vedStandardTwelveMonths: 190,
  };

  it("does nothing when taxDetails is null", async () => {
    expect(await logVedCarBillIfNeeded(email, carId, null)).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("does nothing when the vehicle isn't currently taxed", async () => {
    const sorned: VehicleTaxDetails = { ...taxedDetails, taxIsCurrentlyValid: false, taxStatus: "SORN" };
    expect(await logVedCarBillIfNeeded(email, carId, sorned)).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("does nothing when there's no taxDueDate to anchor a period to", async () => {
    const noDueDate: VehicleTaxDetails = { ...taxedDetails, taxDueDate: null };
    expect(await logVedCarBillIfNeeded(email, carId, noDueDate)).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("creates a road-tax bill for the inferred period when none exists yet", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([]);
    const created = await logVedCarBillIfNeeded(email, carId, taxedDetails);
    expect(created).toBe(true);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "carBill",
      "carBill",
      expect.objectContaining({ carId, billType: "road-tax", cost: 190, date: "2024-07-01" })
    );
  });

  it("does not duplicate a bill already logged for the same inferred period", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([
      { ...baseBill, billType: "road-tax", date: "2024-07-01" },
    ]);
    const created = await logVedCarBillIfNeeded(email, carId, taxedDetails);
    expect(created).toBe(false);
    expect(mocks.createTrackerDoc).not.toHaveBeenCalled();
  });

  it("falls back to a cost of 0 when vedStandardTwelveMonths is null", async () => {
    mocks.queryCarTrackerDocs.mockResolvedValue([]);
    const noRate: VehicleTaxDetails = { ...taxedDetails, vedStandardTwelveMonths: null };
    await logVedCarBillIfNeeded(email, carId, noRate);
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "carBill",
      "carBill",
      expect.objectContaining({ cost: 0 })
    );
  });
});
