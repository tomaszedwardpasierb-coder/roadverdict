import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getCarById: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarMods: vi.fn(),
  getCarBills: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarReminders: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

// Only getCarById is a genuine I/O boundary - getCurrentRegistration is
// pure and already covered elsewhere, so it's kept real via
// importOriginal rather than re-implemented as a stand-in.
vi.mock("@/lib/tracker/car", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tracker/car")>();
  return { ...actual, getCarById: mocks.getCarById };
});

vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.getCarBills }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carReminder", () => ({ getCarReminders: mocks.getCarReminders }));

// Every other dependency (carReminderStatus, mileageAudit,
// sellerReportVerdict, carReportQuestions, carConsumablesDueSoon,
// carUpcomingCosts, carReportNarrative, backdateCheck, carJobTypes/
// carModTypes/carBillTypes, evidenceQuality, reportNarrative) is
// genuinely pure and already has its own dedicated tests - none of it
// is mocked here, so these tests exercise the real wiring.

import {
  computeCarSellerReportRowsAndMetrics,
  getCarSellerReportCore,
} from "@/lib/tracker/carSellerReportData";
import type { CarDoc } from "@/lib/tracker/car";
import type { CarServiceRecordDoc } from "@/lib/tracker/carServiceRecord";
import type { CarModDoc } from "@/lib/tracker/carMod";
import type { CarBillDoc } from "@/lib/tracker/carBill";
import type { CarFuelLogDoc } from "@/lib/tracker/carFuelLog";
import type { CarReminderDoc } from "@/lib/tracker/carReminder";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
}

function makeCar(overrides: Partial<CarDoc> = {}): CarDoc {
  return {
    id: "car-1", pk: "owner@example.com", type: "car", make: "Ford", model: "Focus", fuelType: "petrol",
    year: 2019, engineLitres: 1.6, currentMileage: 40000, startingMileage: 0,
    nickname: "", dateAdded: "2024-01-01",
    ...overrides,
  } as CarDoc;
}

function makeRecord(overrides: Partial<CarServiceRecordDoc> = {}): CarServiceRecordDoc {
  return {
    id: "sr-1", pk: "owner@example.com", type: "carService", carId: "car-1", jobType: "oil-filter",
    cost: 50, mileage: 20000, notes: "", date: "2025-01-01", createdAt: "2025-01-02T00:00:00.000Z",
    ...overrides,
  } as CarServiceRecordDoc;
}

describe("computeCarSellerReportRowsAndMetrics", () => {
  const car = makeCar();

  it("builds rows from service records, mods, and bills only - not fuel logs", () => {
    const records = [makeRecord()];
    const mods = [{ id: "m-1", pk: "x", type: "carMod", carId: "car-1", category: "dash-cam", name: "Nextbase 622GW", cost: 180, mileage: 20000, notes: "", date: "2025-02-01", createdAt: "2025-02-02T00:00:00.000Z" } as CarModDoc];
    const bills = [{ id: "b-1", pk: "x", type: "carBill", carId: "car-1", billType: "road-tax", cost: 200, notes: "", date: "2025-03-01", createdAt: "2025-03-02T00:00:00.000Z" } as CarBillDoc];
    const fuelLogs = [{ id: "f-1", pk: "x", type: "carFuelLog", carId: "car-1", fuelType: "petrol", litres: 40, cost: 60, mileage: 20000, filledToFull: true, date: "2025-04-01", createdAt: "2025-04-02T00:00:00.000Z" } as CarFuelLogDoc];

    const result = computeCarSellerReportRowsAndMetrics(car, records, mods, bills, fuelLogs, []);

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((r) => r.category).sort()).toEqual(["Bill", "Modification", "Service"]);
  });

  it("labels each row using the right car label table for its own category", () => {
    const records = [makeRecord({ jobType: "oil-filter" })];
    const mods = [{ id: "m-1", pk: "x", type: "carMod", carId: "car-1", category: "dash-cam", name: "Nextbase 622GW", cost: 180, mileage: 20000, notes: "", date: "2025-02-01", createdAt: "2025-02-02T00:00:00.000Z" } as CarModDoc];
    const bills = [{ id: "b-1", pk: "x", type: "carBill", carId: "car-1", billType: "ulez-caz", cost: 12.5, notes: "", date: "2025-03-01", createdAt: "2025-03-02T00:00:00.000Z" } as CarBillDoc];

    const result = computeCarSellerReportRowsAndMetrics(car, records, mods, bills, [], []);

    expect(result.rows.find((r) => r.category === "Service")?.description).toBe("Oil & filter change");
    expect(result.rows.find((r) => r.category === "Modification")?.description).toBe("Dash cam: Nextbase 622GW");
    expect(result.rows.find((r) => r.category === "Bill")?.description).toBe("ULEZ / Clean Air Zone charge");
  });

  it("sorts rows chronologically by date, regardless of input order", () => {
    const records = [makeRecord({ id: "sr-late", date: "2025-06-01" }), makeRecord({ id: "sr-early", date: "2025-01-01" })];
    const result = computeCarSellerReportRowsAndMetrics(car, records, [], [], [], []);
    expect(result.rows.map((r) => r.id)).toEqual(["sr-early", "sr-late"]);
  });

  it("sums every row's cost into the total", () => {
    const records = [makeRecord({ cost: 40 }), makeRecord({ id: "sr-2", cost: 60 })];
    const result = computeCarSellerReportRowsAndMetrics(car, records, [], [], [], []);
    expect(result.total).toBe(100);
  });

  it("counts a row as backdated only once it's genuinely more than 7 days after its claimed date", () => {
    const onTime = makeRecord({ id: "sr-on-time", date: "2025-01-01", createdAt: "2025-01-03T00:00:00.000Z" });
    const backdated = makeRecord({ id: "sr-backdated", date: "2025-01-01", createdAt: "2025-03-01T00:00:00.000Z" });
    const result = computeCarSellerReportRowsAndMetrics(car, [onTime, backdated], [], [], [], []);
    expect(result.backdatedCount).toBe(1);
    expect(result.realTimeCount).toBe(1);
  });

  it("resolves currentRegistration via the car's real registration history, not just its original", () => {
    const carWithChange = makeCar({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "XY99 ZZZ", reason: "private-plate-assigned", changedAt: "2025-01-01T00:00:00.000Z" }],
    });
    const result = computeCarSellerReportRowsAndMetrics(carWithChange, [], [], [], [], []);
    expect(result.currentRegistration).toBe("XY99 ZZZ");
    expect(result.registrationChanges).toHaveLength(1);
  });

  it("feeds through into verdictMetrics.totalEntries, receiptCount, and overdueReminderCount", () => {
    const records = [makeRecord()];
    const overdueReminder = { id: "rem-1", pk: "x", type: "carReminder", carId: "car-1", name: "MOT", intervalType: "date", exactDate: "2020-01-01" } as CarReminderDoc;
    const result = computeCarSellerReportRowsAndMetrics(car, records, [], [], [], [overdueReminder]);
    expect(result.verdictMetrics.totalEntries).toBe(1);
    expect(result.verdictMetrics.totalReminderCount).toBe(1);
    expect(result.verdictMetrics.overdueReminderCount).toBe(1);
  });

  describe("hiding insurance/finance from the buyer-facing rows and total", () => {
    const insuranceBill = { id: "b-ins", pk: "x", type: "carBill" as const, carId: "car-1", billType: "insurance", cost: 200, notes: "", date: "2025-03-01", createdAt: "2025-03-02T00:00:00.000Z" } as CarBillDoc;
    const roadTaxBill = { id: "b-tax", pk: "x", type: "carBill" as const, carId: "car-1", billType: "road-tax", cost: 90, notes: "", date: "2025-04-01", createdAt: "2025-04-02T00:00:00.000Z" } as CarBillDoc;
    const financeBill = { id: "b-fin", pk: "x", type: "carBill" as const, carId: "car-1", billType: "finance", cost: 300, notes: "", date: "2025-06-01", createdAt: "2025-06-02T00:00:00.000Z" } as CarBillDoc;

    it("excludes insurance from rows and total by default (car.includeInsuranceInReport unset)", () => {
      const result = computeCarSellerReportRowsAndMetrics(makeCar(), [], [], [insuranceBill, roadTaxBill], [], []);
      expect(result.rows.map((r) => r.id)).toEqual(["b-tax"]);
      expect(result.total).toBe(90);
    });

    it("shows insurance once includeInsuranceInReport is true", () => {
      const result = computeCarSellerReportRowsAndMetrics(makeCar({ includeInsuranceInReport: true }), [], [], [insuranceBill, roadTaxBill], [], []);
      expect(result.rows.map((r) => r.id).sort()).toEqual(["b-ins", "b-tax"]);
      expect(result.total).toBe(290);
    });

    it("excludes finance from rows and total by default, independently of the insurance setting", () => {
      const result = computeCarSellerReportRowsAndMetrics(makeCar({ includeInsuranceInReport: true }), [], [], [financeBill, insuranceBill], [], []);
      expect(result.rows.map((r) => r.id)).toEqual(["b-ins"]);
      expect(result.total).toBe(200);
    });

    it("still counts a hidden insurance entry toward totalEntries and receiptCount - documentation trust signals aren't affected by buyer-facing visibility", () => {
      const insuranceWithReceipt = { ...insuranceBill, attachments: [{ blobName: "a.jpg", fileName: "a.jpg", fileType: "image/jpeg" as const, uploadedAt: "2025-03-01" }] };
      const result = computeCarSellerReportRowsAndMetrics(makeCar(), [], [], [insuranceWithReceipt], [], []);
      expect(result.rows).toEqual([]);
      expect(result.verdictMetrics.totalEntries).toBe(1);
      expect(result.verdictMetrics.receiptCount).toBe(1);
    });
  });
});

describe("getCarSellerReportCore", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.getCarServiceRecords.mockResolvedValue([]);
    mocks.getCarMods.mockResolvedValue([]);
    mocks.getCarBills.mockResolvedValue([]);
    mocks.getCarFuelLogs.mockResolvedValue([]);
    mocks.getCarReminders.mockResolvedValue([]);
  });

  it("calls notFound() (rather than returning null/undefined) when the car doesn't exist", async () => {
    mocks.getCarById.mockResolvedValue(null);
    await expect(getCarSellerReportCore("owner@example.com", "car-1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("assembles a full report from the car and its records, wiring in the real (already-tested) computation pipeline", async () => {
    mocks.getCarById.mockResolvedValue(makeCar());
    mocks.getCarServiceRecords.mockResolvedValue([makeRecord()]);

    const core = await getCarSellerReportCore("owner@example.com", "car-1");

    expect(core.car.make).toBe("Ford");
    expect(core.rows).toHaveLength(1);
    expect(core.total).toBe(50);
    expect(core.motCheckUrl).toBe("https://www.check-mot.service.gov.uk/");
    expect(core.verdict).toBeDefined();
    expect(Array.isArray(core.buyerQuestions)).toBe(true);
    expect(Array.isArray(core.storyParagraphs)).toBe(true);
    expect(core.mileageCheck).toEqual({ implausible: false });
  });

  // The one behaviour genuinely distinct from the bike version - no
  // materialize-due-instalments call exists at all (no car billSeries
  // yet), so this just confirms nothing throws or expects one.
  it("never calls a materialize-instalments step (no car billSeries exists yet)", async () => {
    mocks.getCarById.mockResolvedValue(makeCar());
    const core = await getCarSellerReportCore("owner@example.com", "car-1");
    expect(core).toBeDefined();
  });

  it("uses the car's own, higher mileage-plausibility ceiling, not the motorcycle one", async () => {
    // 300,000 miles would trip reportNarrative.ts's bike-tuned 250,000
    // ceiling, but must NOT trip carReportNarrative.ts's own 400,000 one.
    mocks.getCarById.mockResolvedValue(makeCar({ currentMileage: 300000, year: 2000 }));
    const core = await getCarSellerReportCore("owner@example.com", "car-1");
    expect(core.mileageCheck.implausible).toBe(false);
  });
});
