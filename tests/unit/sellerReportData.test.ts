import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  getBike: vi.fn(),
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
  getFuelLogs: vi.fn(),
  getReminders: vi.fn(),
  resolveShareToken: vi.fn(),
  getReceiptRequestsForShareToken: vi.fn(),
  materializeAllDueForBike: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

// Only getBike is a genuine I/O boundary here - getCurrentRegistration
// is pure and already covered by bike.test.ts, so it's kept real via
// importOriginal rather than re-implemented as a stand-in.
vi.mock("@/lib/tracker/bike", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tracker/bike")>();
  return { ...actual, getBike: mocks.getBike };
});

vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/reminder", () => ({ getReminders: mocks.getReminders }));
vi.mock("@/lib/tracker/shareLink", () => ({ resolveShareToken: mocks.resolveShareToken }));
vi.mock("@/lib/tracker/billSeries", () => ({ materializeAllDueForBike: mocks.materializeAllDueForBike }));

// Only getReceiptRequestsForShareToken is a genuine I/O boundary -
// canSendReminder is pure and already covered by receiptRequest.test.ts.
vi.mock("@/lib/tracker/receiptRequest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/tracker/receiptRequest")>();
  return { ...actual, getReceiptRequestsForShareToken: mocks.getReceiptRequestsForShareToken };
});

// Every other dependency (reminderStatus, mileageAudit, sellerReportVerdict,
// reportQuestions, consumablesDueSoon, upcomingCosts, motorcycleModels,
// evidenceQuality, reportNarrative, backdateCheck, jobTypes/modTypes/
// billTypes) is genuinely pure and already has its own dedicated tests -
// none of it is mocked, so these tests exercise the real wiring between
// sellerReportData.ts and all of it, not stand-ins for it.

import {
  computeSellerReportRowsAndMetrics,
  getSellerReportCore,
  getSellerReportData,
} from "@/lib/tracker/sellerReportData";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import type { ModDoc } from "@/lib/tracker/mod";
import type { BillDoc } from "@/lib/tracker/bill";
import type { FuelLogDoc } from "@/lib/tracker/fuelLog";
import type { ReminderDoc } from "@/lib/tracker/reminder";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
}

function makeBike(overrides: Partial<BikeDoc> = {}): BikeDoc {
  return {
    id: "bike-1", pk: "owner@example.com", type: "bike", make: "Honda", model: "CB500F",
    year: 2019, engineCC: 471, currentMileage: 9000, startingMileage: 0,
    dateAdded: "2024-01-01",
    ...overrides,
  } as BikeDoc;
}

function makeRecord(overrides: Partial<ServiceRecordDoc> = {}): ServiceRecordDoc {
  return {
    id: "sr-1", pk: "owner@example.com", type: "serviceRecord", jobType: "oil-filter",
    cost: 50, mileage: 5000, notes: "", date: "2025-01-01", createdAt: "2025-01-02T00:00:00.000Z",
    ...overrides,
  } as ServiceRecordDoc;
}

describe("computeSellerReportRowsAndMetrics", () => {
  const bike = makeBike();

  it("builds rows from service records, mods, and bills only - not fuel logs", () => {
    const records = [makeRecord()];
    const mods = [{ id: "m-1", pk: "x", type: "mod", category: "exhaust", name: "Akrapovic can", cost: 300, mileage: 5000, notes: "", date: "2025-02-01", createdAt: "2025-02-02T00:00:00.000Z" } as ModDoc];
    const bills = [{ id: "b-1", pk: "x", type: "bill", billType: "insurance", cost: 200, notes: "", date: "2025-03-01", createdAt: "2025-03-02T00:00:00.000Z" } as BillDoc];
    const fuelLogs = [{ id: "f-1", pk: "x", type: "fuelLog", litres: 10, cost: 15, mileage: 5000, filledToFull: true, date: "2025-04-01", createdAt: "2025-04-02T00:00:00.000Z" } as FuelLogDoc];

    const result = computeSellerReportRowsAndMetrics(bike, records, mods, bills, fuelLogs, []);

    expect(result.rows).toHaveLength(3);
    expect(result.rows.map((r) => r.category).sort()).toEqual(["Bill", "Modification", "Service"]);
  });

  it("labels each row using the right label table for its own category", () => {
    const records = [makeRecord({ jobType: "oil-filter" })];
    const mods = [{ id: "m-1", pk: "x", type: "mod", category: "exhaust-can", name: "Akrapovic can", cost: 300, mileage: 5000, notes: "", date: "2025-02-01", createdAt: "2025-02-02T00:00:00.000Z" } as ModDoc];
    const bills = [{ id: "b-1", pk: "x", type: "bill", billType: "mot-test", cost: 55, notes: "", date: "2025-03-01", createdAt: "2025-03-02T00:00:00.000Z" } as BillDoc];

    const result = computeSellerReportRowsAndMetrics(bike, records, mods, bills, [], []);

    expect(result.rows.find((r) => r.category === "Service")?.description).toBe("Oil & filter change");
    expect(result.rows.find((r) => r.category === "Modification")?.description).toBe("Exhaust can / muffler: Akrapovic can");
    expect(result.rows.find((r) => r.category === "Bill")?.description).toBe("MOT test");
  });

  it("sorts rows chronologically by date, regardless of input order", () => {
    const records = [makeRecord({ id: "sr-late", date: "2025-06-01" }), makeRecord({ id: "sr-early", date: "2025-01-01" })];
    const result = computeSellerReportRowsAndMetrics(bike, records, [], [], [], []);
    expect(result.rows.map((r) => r.id)).toEqual(["sr-early", "sr-late"]);
  });

  it("sums every row's cost into the total", () => {
    const records = [makeRecord({ cost: 40 }), makeRecord({ id: "sr-2", cost: 60 })];
    const result = computeSellerReportRowsAndMetrics(bike, records, [], [], [], []);
    expect(result.total).toBe(100);
  });

  it("counts a row as backdated only once it's genuinely more than 7 days after its claimed date", () => {
    const onTime = makeRecord({ id: "sr-on-time", date: "2025-01-01", createdAt: "2025-01-03T00:00:00.000Z" });
    const backdated = makeRecord({ id: "sr-backdated", date: "2025-01-01", createdAt: "2025-03-01T00:00:00.000Z" });
    const result = computeSellerReportRowsAndMetrics(bike, [onTime, backdated], [], [], [], []);
    expect(result.backdatedCount).toBe(1);
    expect(result.realTimeCount).toBe(1);
  });

  it("counts a row as having a receipt only when it genuinely has at least one attachment", () => {
    const withReceipt = makeRecord({ id: "sr-1", attachments: [{ blobName: "a.jpg", fileName: "a.jpg", fileType: "image/jpeg", uploadedAt: "2025-01-01" }] });
    const withoutReceipt = makeRecord({ id: "sr-2", attachments: undefined });
    const result = computeSellerReportRowsAndMetrics(bike, [withReceipt, withoutReceipt], [], [], [], []);
    expect(result.receiptCount).toBe(1);
    expect(result.rows.find((r) => r.id === "sr-1")?.attachment).toEqual({ blobName: "a.jpg", fileName: "a.jpg", fileType: "image/jpeg", uploadedAt: "2025-01-01" });
    expect(result.rows.find((r) => r.id === "sr-2")?.attachment).toBeNull();
  });

  it("resolves currentRegistration via the bike's real registration history, not just its original", () => {
    const bikeWithChange = makeBike({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "XY99 ZZZ", reason: "private-plate-assigned", changedAt: "2025-01-01T00:00:00.000Z" }],
    });
    const result = computeSellerReportRowsAndMetrics(bikeWithChange, [], [], [], [], []);
    expect(result.currentRegistration).toBe("XY99 ZZZ");
    expect(result.registrationChanges).toHaveLength(1);
  });

  it("reports daysSinceLastChange as null when the registration has never changed", () => {
    const result = computeSellerReportRowsAndMetrics(makeBike({ registrationChanges: undefined }), [], [], [], [], []);
    expect(result.daysSinceLastChange).toBeNull();
    expect(result.mostRecentChange).toBeUndefined();
  });

  it("computes daysSinceLastChange from the most recent registration change", () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const bikeWithChange = makeBike({ registrationChanges: [{ plate: "XY99 ZZZ", reason: "correction", changedAt: tenDaysAgo }] });
    const result = computeSellerReportRowsAndMetrics(bikeWithChange, [], [], [], [], []);
    expect(result.daysSinceLastChange).toBeGreaterThanOrEqual(9);
    expect(result.daysSinceLastChange).toBeLessThanOrEqual(11);
  });

  it("feeds through into verdictMetrics.totalEntries, receiptCount, and overdueReminderCount", () => {
    const records = [makeRecord()];
    const overdueReminder = { id: "rem-1", pk: "x", type: "reminder", name: "MOT", intervalType: "date", exactDate: "2020-01-01" } as ReminderDoc;
    const result = computeSellerReportRowsAndMetrics(bike, records, [], [], [], [overdueReminder]);
    expect(result.verdictMetrics.totalEntries).toBe(1);
    expect(result.verdictMetrics.totalReminderCount).toBe(1);
    expect(result.verdictMetrics.overdueReminderCount).toBe(1);
  });

  it("computes spanYears and longestGapDays across the rows' own dates", () => {
    const records = [makeRecord({ id: "a", date: "2024-01-01" }), makeRecord({ id: "b", date: "2025-01-01" })];
    const result = computeSellerReportRowsAndMetrics(bike, records, [], [], [], []);
    expect(result.verdictMetrics.longestGapDays).toBe(366); // 2024 is a leap year
    expect(result.verdictMetrics.spanYears).toBeGreaterThan(0.9);
    expect(result.verdictMetrics.spanYears).toBeLessThan(1.1);
  });

  it("reports zero mileage violations and no clusters for an ordinary, well-spread record set", () => {
    const records = [makeRecord({ id: "a", date: "2024-01-01", createdAt: "2024-01-02T00:00:00.000Z" }), makeRecord({ id: "b", date: "2025-01-01", createdAt: "2025-01-02T00:00:00.000Z" })];
    const result = computeSellerReportRowsAndMetrics(bike, records, [], [], [], []);
    expect(result.verdictMetrics.mileageViolationCount).toBe(0);
    expect(result.clusters).toEqual([]);
  });
});

describe("getSellerReportCore", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.getBills.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getReminders.mockResolvedValue([]);
  });

  it("calls notFound() (rather than returning null/undefined) when the bike doesn't exist", async () => {
    mocks.getBike.mockResolvedValue(null);
    await expect(getSellerReportCore("owner@example.com", "bike-1")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("assembles a full report from the bike and its records, wiring in the real (already-tested) computation pipeline", async () => {
    mocks.getBike.mockResolvedValue(makeBike());
    mocks.getServiceRecords.mockResolvedValue([makeRecord()]);

    const core = await getSellerReportCore("owner@example.com", "bike-1");

    expect(core.bike.make).toBe("Honda");
    expect(core.rows).toHaveLength(1);
    expect(core.total).toBe(50);
    expect(core.motCheckUrl).toBe("https://www.check-mot.service.gov.uk/");
    // Real downstream pure functions, not stand-ins - just confirming
    // they were genuinely called and produced sensible shapes, since
    // their own correctness is covered by their own dedicated tests.
    expect(core.verdict).toBeDefined();
    expect(Array.isArray(core.buyerQuestions)).toBe(true);
    expect(Array.isArray(core.storyParagraphs)).toBe(true);
    expect(core.mileageCheck).toEqual({ implausible: false });
  });
});

describe("getSellerReportData", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.getServiceRecords.mockResolvedValue([]);
    mocks.getMods.mockResolvedValue([]);
    mocks.getBills.mockResolvedValue([]);
    mocks.getFuelLogs.mockResolvedValue([]);
    mocks.getReminders.mockResolvedValue([]);
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([]);
  });

  it("calls notFound() for an invalid or expired token, without ever fetching the bike", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);
    await expect(getSellerReportData("bad-token")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("returns the token and askingPrice alongside the core report data", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1", askingPrice: 5000 });
    mocks.getBike.mockResolvedValue(makeBike());

    const data = await getSellerReportData("tok_abc123");

    expect(data.token).toBe("tok_abc123");
    expect(data.askingPrice).toBe(5000);
    expect(data.bike.make).toBe("Honda");
  });

  // The real, distinctive piece of logic in this function: when the
  // same entry was asked about more than once, the most recently
  // created request's status must win, not the oldest.
  it("resolves entryRequestStatus to the most recently created request when an entry was asked about more than once", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue(makeBike());
    mocks.getReceiptRequestsForShareToken.mockResolvedValue([
      {
        id: "req-old", pk: "owner@example.com", type: "receiptRequest", shareToken: "tok_abc123", bikeId: "bike-1",
        items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", reason: "too personal" }],
        decisionTokenHash: "h1", createdAt: "2025-01-01T00:00:00.000Z", ttl: 1,
      },
      {
        id: "req-new", pk: "owner@example.com", type: "receiptRequest", shareToken: "tok_abc123", bikeId: "bike-1",
        items: [{ entryId: "sr-1", category: "service", description: "x", status: "pending" }],
        decisionTokenHash: "h2", createdAt: "2025-02-01T00:00:00.000Z", ttl: 1,
      },
    ] as any);

    const data = await getSellerReportData("tok_abc123");

    expect(data.entryRequestStatus["sr-1"]).toMatchObject({ status: "pending", requestCreatedAt: "2025-02-01T00:00:00.000Z" });
  });
});