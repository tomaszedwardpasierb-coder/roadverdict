import { beforeEach, describe, expect, it, vi } from "vitest";

// Note: computeMPGSeries/computeActualMPG are re-exported from this file
// purely for import-path convenience (see the source file's own comment).
// Their actual math is already covered by mpgCalc.test.ts against
// mpgCalc.ts directly - this file only tests the CRUD/orchestration
// functions fuelLog.ts itself defines.

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

import { createFuelLog, getFuelLogs, updateFuelLog, deleteFuelLog } from "@/lib/tracker/fuelLog";

const email = "rider@example.com";
const bikeId = "bike-1";

const baseFuelLog = {
  id: `${email}::fuel::1`,
  pk: email,
  type: "fuelLog" as const,
  bikeId,
  litres: 15.2,
  cost: 22.5,
  mileage: 10500,
  filledToFull: true,
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.createTrackerDoc.mockResolvedValue(baseFuelLog);
  mocks.queryTrackerDocs.mockResolvedValue([]);
  mocks.updateTrackerDoc.mockResolvedValue(baseFuelLog);
  mocks.deleteTrackerDoc.mockResolvedValue(undefined);
});

describe("createFuelLog", () => {
  // idPrefix ("fuel") and type ("fuelLog") deliberately differ here - pin
  // both distinctly so a future refactor that accidentally aligns them
  // (breaking id generation or the query type filter below) gets caught.
  it("delegates to createTrackerDoc with idPrefix 'fuel' and type 'fuelLog'", async () => {
    await createFuelLog(email, { bikeId, litres: 15.2, cost: 22.5, mileage: 10500, date: "2025-01-01", filledToFull: true });
    expect(mocks.createTrackerDoc).toHaveBeenCalledWith(
      email,
      "fuel",
      "fuelLog",
      expect.objectContaining({ litres: 15.2, cost: 22.5, mileage: 10500, filledToFull: true })
    );
  });

  it("returns the created fuel log document", async () => {
    const result = await createFuelLog(email, { bikeId, litres: 15.2, cost: 22.5, mileage: 10500, date: "2025-01-01", filledToFull: true });
    expect(result).toEqual(baseFuelLog);
  });

  it("passes optional fields (needsReview, mileageConfidence, aiDescription, mileageConflictWarning) through when supplied", async () => {
    await createFuelLog(email, {
      bikeId,
      litres: 15.2,
      cost: 22.5,
      mileage: 10500,
      date: "2025-01-01",
      filledToFull: true,
      needsReview: true,
      mileageConfidence: "interpolated",
      aiDescription: "Fuel at Shell (Fuel)",
      mileageConflictWarning: "Mileage lower than a previous record",
    });
    const payload = mocks.createTrackerDoc.mock.calls[0][3];
    expect(payload.needsReview).toBe(true);
    expect(payload.mileageConfidence).toBe("interpolated");
    expect(payload.aiDescription).toBe("Fuel at Shell (Fuel)");
    expect(payload.mileageConflictWarning).toBe("Mileage lower than a previous record");
  });
});

describe("getFuelLogs", () => {
  it("queries fuel logs scoped to the given email, type 'fuelLog', and bikeId", async () => {
    await getFuelLogs(email, bikeId);
    expect(mocks.queryTrackerDocs).toHaveBeenCalledWith(email, "fuelLog", bikeId);
  });

  it("returns the query results", async () => {
    mocks.queryTrackerDocs.mockResolvedValue([baseFuelLog]);
    expect(await getFuelLogs(email, bikeId)).toEqual([baseFuelLog]);
  });

  it("returns an empty array when there are no fuel logs", async () => {
    expect(await getFuelLogs(email, bikeId)).toEqual([]);
  });
});

describe("updateFuelLog", () => {
  it("delegates to updateTrackerDoc with the email, id, and data", async () => {
    await updateFuelLog(email, baseFuelLog.id, { litres: 16, cost: 24, mileage: 10800, date: "2025-02-01", filledToFull: false });
    expect(mocks.updateTrackerDoc).toHaveBeenCalledWith(
      email,
      baseFuelLog.id,
      expect.objectContaining({ litres: 16, cost: 24, mileage: 10800, filledToFull: false })
    );
  });

  it("returns null when the underlying doc doesn't exist", async () => {
    mocks.updateTrackerDoc.mockResolvedValue(null);
    expect(await updateFuelLog(email, "missing", { litres: 1, cost: 1, mileage: 1, date: "2025-01-01", filledToFull: false })).toBeNull();
  });

  it("allows explicitly clearing mileageConflictWarning by passing null", async () => {
    await updateFuelLog(email, baseFuelLog.id, { litres: 15.2, cost: 22.5, mileage: 10500, date: "2025-01-01", filledToFull: true, mileageConflictWarning: null });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileageConflictWarning).toBeNull();
  });

  it("can promote mileageConfidence to 'confirmed' on a manual re-save", async () => {
    await updateFuelLog(email, baseFuelLog.id, { litres: 15.2, cost: 22.5, mileage: 10500, date: "2025-01-01", filledToFull: true, mileageConfidence: "confirmed" });
    const payload = mocks.updateTrackerDoc.mock.calls[0][2];
    expect(payload.mileageConfidence).toBe("confirmed");
  });
});

describe("deleteFuelLog", () => {
  it("delegates to deleteTrackerDoc with email and id", async () => {
    await deleteFuelLog(email, baseFuelLog.id);
    expect(mocks.deleteTrackerDoc).toHaveBeenCalledWith(email, baseFuelLog.id);
  });
});
