import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTrackerDoc: vi.fn(),
  queryTrackerDocs: vi.fn(),
  updateTrackerDoc: vi.fn(),
  deleteTrackerDoc: vi.fn(),
  getContainer: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({ getContainer: mocks.getContainer }));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({
  createTrackerDoc: mocks.createTrackerDoc,
  queryTrackerDocs: mocks.queryTrackerDocs,
  updateTrackerDoc: mocks.updateTrackerDoc,
  deleteTrackerDoc: mocks.deleteTrackerDoc,
}));

import {
  createBillSeries,
  getBillSeriesForBike,
  endBillSeries,
  materializeDueInstalments,
  materializeAllDueForBike,
  type BillSeriesDoc,
} from "@/lib/tracker/billSeries";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseSeries: BillSeriesDoc = {
  id: `${email}::billSeries::1`,
  pk: email,
  type: "billSeries",
  bikeId,
  billType: "insurance",
  frequency: "monthly",
  startDate: "2025-01-01",
  collectionDay: 1,
  depositAmount: 110,
  instalmentAmount: 42.5,
  instalmentCount: 12,
  lastMaterializedIndex: -1,
  status: "active",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseSeries);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseSeries);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue(undefined);
  mocks.getContainer.mockReturnValue({ items: { upsert: mocks.upsert } });
});

describe("createBillSeries", () => {
  it("delegates to createTrackerDoc with idPrefix and type both 'billSeries'", async () => {
    await createBillSeries(email, {
      bikeId, billType: "insurance", frequency: "monthly", startDate: "2025-01-01",
      collectionDay: 1, depositAmount: 110, instalmentAmount: 42.5, instalmentCount: 12,
    });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email, "billSeries", "billSeries",
      expect.objectContaining({ billType: "insurance", instalmentAmount: 42.5 })
    );
  });

  it("starts lastMaterializedIndex at -1 and status 'active'", async () => {
    await createBillSeries(email, {
      bikeId, billType: "road-tax", frequency: "six-monthly", startDate: "2025-01-01",
      collectionDay: 1, instalmentAmount: 100, instalmentCount: 2,
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.lastMaterializedIndex).toBe(-1);
    expect(payload.status).toBe("active");
  });

  it("sets the base doc's `date` field to startDate", async () => {
    await createBillSeries(email, {
      bikeId, billType: "insurance", frequency: "monthly", startDate: "2025-03-15",
      collectionDay: 15, instalmentAmount: 42.5, instalmentCount: 12,
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.date).toBe("2025-03-15");
  });
});

describe("getBillSeriesForBike", () => {
  it("queries series scoped to email, type, and bikeId", async () => {
    await getBillSeriesForBike(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "billSeries", bikeId);
  });
});

describe("endBillSeries", () => {
  it("sets status to 'ended' via updateTrackerDoc", async () => {
    await endBillSeries(email, baseSeries.id);
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(email, baseSeries.id, { status: "ended" });
  });
});

describe("materializeDueInstalments", () => {
  it("does nothing and writes nothing when no instalment is due yet", async () => {
    const result = await materializeDueInstalments(email, baseSeries, new Date("2024-12-31"));
    expect(result).toEqual([]);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.updateTrackerDoc).not.toHaveBeenCalled();
  });

  it("writes a bill with a deterministic id keyed on series id + index, not a timestamp", async () => {
    await materializeDueInstalments(email, baseSeries, new Date("2025-01-01"));
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc.id).toBe(`${email}::bill::series::${baseSeries.id}::0`);
  });

  it("writes the deposit amount and 'auto' provenance for the first instalment", async () => {
    await materializeDueInstalments(email, baseSeries, new Date("2025-01-01"));
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc).toMatchObject({
      type: "bill",
      bikeId,
      billType: "insurance",
      cost: 110,
      date: "2025-01-01",
      notes: "Deposit (payment 1 of 12)",
      seriesId: baseSeries.id,
      seriesIndex: 0,
      source: "auto",
    });
  });

  it("writes one bill per due instalment when several have accumulated", async () => {
    const series = { ...baseSeries, lastMaterializedIndex: 0 };
    await materializeDueInstalments(email, series, new Date("2025-04-01"));
    // indices 1 (Feb), 2 (Mar), 3 (Apr) are all due by 2025-04-01.
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    const indices = mocks.upsert.mock.calls.map((c) => c[0].seriesIndex).sort();
    expect(indices).toEqual([1, 2, 3]);
  });

  it("advances lastMaterializedIndex to the highest index just created, and leaves status active mid-term", async () => {
    await materializeDueInstalments(email, baseSeries, new Date("2025-01-01"));
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email, baseSeries.id,
      { lastMaterializedIndex: 0, status: "active" }
    );
  });

  it("flips status to 'completed' once the final instalment is materialised", async () => {
    const series = { ...baseSeries, lastMaterializedIndex: 10 };
    await materializeDueInstalments(email, series, new Date("2030-01-01"));
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email, baseSeries.id,
      { lastMaterializedIndex: 11, status: "completed" }
    );
  });

  it("never materialises anything for a series that isn't active", async () => {
    const ended = { ...baseSeries, status: "ended" as const };
    const result = await materializeDueInstalments(email, ended, new Date("2030-01-01"));
    expect(result).toEqual([]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not resurrect a deleted instalment - re-running after lastMaterializedIndex has advanced past it creates nothing for that index again", async () => {
    // Simulates: instalment 0 was already materialised once (and may
    // since have been deleted by the user) - lastMaterializedIndex
    // already reflects that, independent of whether the bill document
    // itself still exists.
    const series = { ...baseSeries, lastMaterializedIndex: 0 };
    await materializeDueInstalments(email, series, new Date("2025-01-01"));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("materializeAllDueForBike", () => {
  it("materialises only active series, skipping completed/ended ones", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([
      { ...baseSeries, id: "s-active", status: "active" },
      { ...baseSeries, id: "s-completed", status: "completed", lastMaterializedIndex: 11 },
      { ...baseSeries, id: "s-ended", status: "ended" },
    ]);
    await materializeAllDueForBike(email, bikeId);
    const seriesIdsWritten = new Set(mocks.upsert.mock.calls.map((c) => c[0].seriesId));
    expect(seriesIdsWritten.has("s-active")).toBe(true);
    expect(seriesIdsWritten.has("s-completed")).toBe(false);
    expect(seriesIdsWritten.has("s-ended")).toBe(false);
  });

  it("does nothing when there are no series for this bike", async () => {
    await materializeAllDueForBike(email, bikeId);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
