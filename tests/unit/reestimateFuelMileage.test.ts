import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  getFuelLogs: vi.fn(),
  getBills: vi.fn(),
  updateFuelLog: vi.fn(),
  estimateMileage: vi.fn(),
}));

vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/fuelLog", () => ({
  getFuelLogs: mocks.getFuelLogs,
  updateFuelLog: mocks.updateFuelLog,
}));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/tracker/mileageEstimate", () => ({ estimateMileage: mocks.estimateMileage }));

import { reestimateFuelMileage } from "@/lib/tracker/reestimateFuelMileage";

const email = "rider@example.com";
const bike = {
  id: "bike-1",
  startingMileage: 0,
  currentMileage: 10000,
  dateAdded: "2023-01-01",
} as any;

const baseFuelLog = {
  id: "fl-1",
  date: "2025-01-01",
  litres: 12,
  cost: 20,
  mileage: 4500,
  filledToFull: true,
  mileageConfidence: "estimated" as const,
  mileageConflictWarning: null,
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getMods.mockResolvedValue([]);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getBills.mockResolvedValue([]);
  mocks.updateFuelLog.mockResolvedValue(undefined);
});

describe("reestimateFuelMileage", () => {
  it("returns updatedCount 0 when there are no fuel logs at all", async () => {
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 0 });
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  it("returns updatedCount 0 when all fuel logs are already confirmed or have no confidence set", async () => {
    mocks.getFuelLogs.mockResolvedValue([
      { ...baseFuelLog, id: "fl-confirmed", mileageConfidence: "confirmed" },
      { ...baseFuelLog, id: "fl-no-confidence", mileageConfidence: undefined },
    ]);
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 0 });
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  it("skips a candidate when the new estimate requires manual entry", async () => {
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 3000,
      confidence: "estimated",
      requiresManualEntry: true,
    });
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 0 });
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  it("skips a candidate when the new estimate equals the stored mileage", async () => {
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]); // stored mileage: 4500
    mocks.estimateMileage.mockReturnValue({
      mileage: 4500, // same value — no write needed
      confidence: "interpolated",
      requiresManualEntry: false,
    });
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 0 });
    expect(mocks.updateFuelLog).not.toHaveBeenCalled();
  });

  it("updates a candidate when the new estimate differs and doesn't require manual entry", async () => {
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 4800,
      confidence: "interpolated",
      requiresManualEntry: false,
      warning: undefined,
    });
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 1 });
    expect(mocks.updateFuelLog).toHaveBeenCalledWith(email, "fl-1", {
      litres: baseFuelLog.litres,
      cost: baseFuelLog.cost,
      mileage: 4800,
      date: baseFuelLog.date,
      filledToFull: baseFuelLog.filledToFull,
      mileageConfidence: "interpolated",
      mileageConflictWarning: null,
    });
  });

  it("treats an 'interpolated' confidence log as a candidate, same as 'estimated'", async () => {
    mocks.getFuelLogs.mockResolvedValue([
      { ...baseFuelLog, mileageConfidence: "interpolated" as const },
    ]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 5000,
      confidence: "interpolated",
      requiresManualEntry: false,
    });
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 1 });
  });

  it("only counts estimated/interpolated logs as candidates — not confirmed or undefined-confidence ones", async () => {
    mocks.getFuelLogs.mockResolvedValue([
      { ...baseFuelLog, id: "candidate", mileageConfidence: "estimated" as const },
      { ...baseFuelLog, id: "confirmed", mileageConfidence: "confirmed" as const },
      { ...baseFuelLog, id: "no-confidence", mileageConfidence: undefined },
    ]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 4800,
      confidence: "interpolated",
      requiresManualEntry: false,
    });
    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 1 });
    expect(mocks.updateFuelLog).toHaveBeenCalledTimes(1);
    expect(mocks.updateFuelLog).toHaveBeenCalledWith(email, "candidate", expect.any(Object));
  });

  // Service records, mods, and MOT-type bills are always trusted; only
  // confirmed fuel logs (and those with no confidence at all) join the
  // trusted-points pool. An 'estimated' fuel log must never be used as
  // a reference point for another estimate — that's the chaining risk
  // the comment in the source file describes.
  it("builds trusted points from services, mods, confirmed fuel, and MOT bills - never from estimated fuel", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ date: "2025-01-01", mileage: 5000 }]);
    mocks.getMods.mockResolvedValue([{ date: "2025-02-01", mileage: 5200 }]);
    mocks.getFuelLogs.mockResolvedValue([
      { ...baseFuelLog, id: "confirmed-fuel", mileage: 5100, mileageConfidence: "confirmed" as const },
      { ...baseFuelLog, id: "estimated-fuel", mileage: 4900, mileageConfidence: "estimated" as const },
    ]);
    mocks.getBills.mockResolvedValue([
      { id: "mot-1", billType: "mot-test", date: "2025-03-01", mileage: 5300 },
      { id: "insurance-1", billType: "insurance", date: "2025-04-01", mileage: 5400 }, // excluded — not MOT
    ]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 4900,
      confidence: "estimated",
      requiresManualEntry: false,
    }); // same as stored — no update

    await reestimateFuelMileage(email, bike);

    // Three trusted points: service(5000) + mod(5200) + confirmed-fuel(5100) + mot-bill(5300)
    expect(mocks.estimateMileage).toHaveBeenCalledWith(
      baseFuelLog.date,
      expect.arrayContaining([
        { date: "2025-01-01", mileage: 5000 },
        { date: "2025-02-01", mileage: 5200 },
        { date: baseFuelLog.date, mileage: 5100 },
        { date: "2025-03-01", mileage: 5300 },
      ]),
      expect.any(Object)
    );
    // Insurance bill must NOT appear
    expect(mocks.estimateMileage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ mileage: 5400 })]),
      expect.anything()
    );
  });

  it("excludes MOT bills with no mileage from trusted points", async () => {
    mocks.getBills.mockResolvedValue([
      { id: "mot-no-mileage", billType: "mot-test", date: "2025-01-01", mileage: null },
    ]);
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]);
    mocks.estimateMileage.mockReturnValue({ mileage: 4900, confidence: "estimated", requiresManualEntry: false });

    await reestimateFuelMileage(email, bike);

    expect(mocks.estimateMileage).toHaveBeenCalledWith(
      expect.anything(),
      expect.not.arrayContaining([expect.objectContaining({ mileage: null })]),
      expect.any(Object)
    );
  });

  it("writes the warning field as null when the estimate result carries no warning", async () => {
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 4800,
      confidence: "estimated",
      requiresManualEntry: false,
      // warning absent
    });
    await reestimateFuelMileage(email, bike);
    expect(mocks.updateFuelLog).toHaveBeenCalledWith(
      email,
      "fl-1",
      expect.objectContaining({ mileageConflictWarning: null })
    );
  });

  it("passes the warning text through when the estimate result carries one", async () => {
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]);
    mocks.estimateMileage.mockReturnValue({
      mileage: 4800,
      confidence: "estimated",
      requiresManualEntry: false,
      warning: "Only one anchor available; estimate may be imprecise.",
    });
    await reestimateFuelMileage(email, bike);
    expect(mocks.updateFuelLog).toHaveBeenCalledWith(
      email,
      "fl-1",
      expect.objectContaining({
        mileageConflictWarning: "Only one anchor available; estimate may be imprecise.",
      })
    );
  });

  it("passes bike lifetime context to every estimateMileage call", async () => {
    mocks.getFuelLogs.mockResolvedValue([baseFuelLog]);
    mocks.estimateMileage.mockReturnValue({ mileage: 4900, confidence: "estimated", requiresManualEntry: false });

    await reestimateFuelMileage(email, bike);

    expect(mocks.estimateMileage).toHaveBeenCalledWith(
      baseFuelLog.date,
      expect.any(Array),
      {
        startingMileage: bike.startingMileage,
        currentMileage: bike.currentMileage,
        dateAdded: bike.dateAdded,
      }
    );
  });

  it("counts multiple updated candidates correctly", async () => {
    const logA = { ...baseFuelLog, id: "fl-a", mileage: 4500 };
    const logB = { ...baseFuelLog, id: "fl-b", mileage: 5000, date: "2025-02-01" };
    mocks.getFuelLogs.mockResolvedValue([logA, logB]);
    mocks.estimateMileage
      .mockReturnValueOnce({ mileage: 4800, confidence: "interpolated", requiresManualEntry: false })
      .mockReturnValueOnce({ mileage: 5200, confidence: "interpolated", requiresManualEntry: false });

    const result = await reestimateFuelMileage(email, bike);
    expect(result).toEqual({ updatedCount: 2 });
    expect(mocks.updateFuelLog).toHaveBeenCalledTimes(2);
  });
});
