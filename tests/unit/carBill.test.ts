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

import { createCarBill, getCarBills, updateCarBill, deleteCarBill } from "@/lib/tracker/carBill";

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
