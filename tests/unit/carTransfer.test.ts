// Mirrors bikeTransfer.test.ts for the car equivalent, including its
// billSeries section - the recipient-limit check here is combined
// bike+car count against MAX_FREE_VEHICLES rather than a car-only cap
// (see carTransfer.ts's own comment for why).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  getCarById: vi.fn(),
  getCarsForUser: vi.fn(),
  generateCarId: vi.fn(),
  countActiveCars: vi.fn(),
  getCurrentRegistration: vi.fn(),
  copyCarTrackerDoc: vi.fn(),
  getBikesForUser: vi.fn(),
  countActiveBikes: vi.fn(),
  normalizePlate: vi.fn(),
  allKnownCarPlates: vi.fn(),
  getCarServiceRecords: vi.fn(),
  getCarMods: vi.fn(),
  getCarBills: vi.fn(),
  getCarFuelLogs: vi.fn(),
  getCarReminders: vi.fn(),
  getBillSeriesForCar: vi.fn(),
  endCarBillSeries: vi.fn(),
  computeCarSellerReportRowsAndMetrics: vi.fn(),
  computeSellerVerdict: vi.fn(),
  upsert: vi.fn(),
  isPro: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: mocks.getContainer,
}));
vi.mock("@/lib/tracker/car", () => ({
  getCarById: mocks.getCarById,
  getCarsForUser: mocks.getCarsForUser,
  generateCarId: mocks.generateCarId,
  countActiveCars: mocks.countActiveCars,
  getCurrentRegistration: mocks.getCurrentRegistration,
  copyCarTrackerDoc: mocks.copyCarTrackerDoc,
}));
vi.mock("@/lib/tracker/bike", () => ({
  getBikesForUser: mocks.getBikesForUser,
  countActiveBikes: mocks.countActiveBikes,
}));
vi.mock("@/lib/tracker/vehicleLimit", () => ({ MAX_FREE_VEHICLES: 2 }));
vi.mock("@/lib/tracker/reportAccess", () => ({ normalizePlate: mocks.normalizePlate }));
vi.mock("@/lib/tracker/carReportAccess", () => ({ allKnownCarPlates: mocks.allKnownCarPlates }));
vi.mock("@/lib/tracker/carServiceRecord", () => ({ getCarServiceRecords: mocks.getCarServiceRecords }));
vi.mock("@/lib/tracker/carMod", () => ({ getCarMods: mocks.getCarMods }));
vi.mock("@/lib/tracker/carBill", () => ({ getCarBills: mocks.getCarBills }));
vi.mock("@/lib/tracker/carFuelLog", () => ({ getCarFuelLogs: mocks.getCarFuelLogs }));
vi.mock("@/lib/tracker/carReminder", () => ({ getCarReminders: mocks.getCarReminders }));
vi.mock("@/lib/tracker/carBillSeries", () => ({
  getBillSeriesForCar: mocks.getBillSeriesForCar,
  endCarBillSeries: mocks.endCarBillSeries,
}));
vi.mock("@/lib/tracker/carSellerReportData", () => ({
  computeCarSellerReportRowsAndMetrics: mocks.computeCarSellerReportRowsAndMetrics,
}));
vi.mock("@/lib/tracker/sellerReportVerdict", () => ({
  computeSellerVerdict: mocks.computeSellerVerdict,
}));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import { transferCar } from "@/lib/tracker/carTransfer";

const fromEmail = "seller@example.com";
const toEmail = "buyer@example.com";
const carId = "car-1";

const oldCar = {
  id: carId,
  pk: fromEmail,
  type: "car",
  make: "Ford",
  model: "Focus",
  year: 2020,
  fuelType: "petrol",
  engineLitres: 1.6,
  isCustomBuild: false,
  originalRegistration: "AB20FOC",
  registrationChanges: [],
  currentMileage: 15000,
  startingMileage: 0,
  nickname: "My Focus",
  region: "london",
  dateAdded: "2023-01-01",
  dvlaData: null,
} as any;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getCarById.mockResolvedValue({ ...oldCar });
  mocks.getCarsForUser.mockResolvedValue([]);
  mocks.getBikesForUser.mockResolvedValue([]);
  mocks.countActiveCars.mockReturnValue(0);
  mocks.countActiveBikes.mockReturnValue(0);
  mocks.getCurrentRegistration.mockReturnValue("AB20FOC");
  mocks.normalizePlate.mockImplementation((p: string) => p.toUpperCase().replace(/\s+/g, ""));
  mocks.allKnownCarPlates.mockImplementation((c: any) => [c.originalRegistration, ...(c.registrationChanges ?? []).map((rc: any) => rc.plate)].filter(Boolean));
  mocks.generateCarId.mockReturnValue("new-car-id");
  mocks.getCarServiceRecords.mockResolvedValue([]);
  mocks.getCarMods.mockResolvedValue([]);
  mocks.getCarBills.mockResolvedValue([]);
  mocks.getCarFuelLogs.mockResolvedValue([]);
  mocks.getCarReminders.mockResolvedValue([]);
  mocks.getBillSeriesForCar.mockResolvedValue([]);
  mocks.endCarBillSeries.mockResolvedValue({});
  mocks.computeCarSellerReportRowsAndMetrics.mockReturnValue({
    rows: [], total: 0, verdictMetrics: {},
  });
  mocks.computeSellerVerdict.mockReturnValue({ label: "Good" });
  mocks.copyCarTrackerDoc.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue(undefined);
  mocks.getContainer.mockReturnValue({ items: { upsert: mocks.upsert } });
});

describe("transferCar", () => {
  // ── Guard conditions ────────────────────────────────────────────────────

  it("returns same_owner when fromEmail equals toEmail", async () => {
    const result = await transferCar(fromEmail, carId, fromEmail, false);
    expect(result).toEqual({ ok: false, reason: "same_owner" });
    expect(mocks.getCarById).not.toHaveBeenCalled();
  });

  it("returns car_not_found when getCarById returns null", async () => {
    mocks.getCarById.mockResolvedValue(null);
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "car_not_found" });
  });

  it("returns already_transferred when the car already has a transferredTo field", async () => {
    mocks.getCarById.mockResolvedValue({
      ...oldCar,
      transferredTo: { newCarId: "x", newOwnerEmail: "other@example.com", transferredAt: "2025-01-01" },
    });
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "already_transferred" });
  });

  it("returns recipient_limit_reached when the recipient's combined bike+car count is already at the cap", async () => {
    mocks.countActiveCars.mockReturnValue(2); // MAX_FREE_VEHICLES = 2
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toMatchObject({ ok: false, reason: "recipient_limit_reached", limit: 2 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("counts the recipient's bikes and cars together against the combined cap, not cars alone", async () => {
    mocks.countActiveBikes.mockReturnValue(1);
    mocks.countActiveCars.mockReturnValue(1);
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toMatchObject({ ok: false, reason: "recipient_limit_reached", limit: 2 });
  });

  it("lets a transfer through past the recipient's free cap when the recipient is Pro", async () => {
    mocks.countActiveCars.mockReturnValue(2);
    mocks.isPro.mockResolvedValue(true);
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result.ok).toBe(true);
  });

  it("returns recipient_already_has_car when the recipient's own cars already include this registration", async () => {
    mocks.getCarsForUser.mockResolvedValue([
      { originalRegistration: "AB20FOC", registrationChanges: [] },
    ]);
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "recipient_already_has_car" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not flag a collision when the recipient's cars have a genuinely different registration", async () => {
    mocks.getCarsForUser.mockResolvedValue([
      { originalRegistration: "DIFFERENT1", registrationChanges: [] },
    ]);
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toMatchObject({ ok: true });
  });

  it("does not check registration collision when the car has no current registration", async () => {
    mocks.getCurrentRegistration.mockReturnValue(null);
    mocks.getCarsForUser.mockResolvedValue([
      { originalRegistration: "AB20FOC", registrationChanges: [] },
    ]);
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toMatchObject({ ok: true });
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("returns ok:true with the new car on a successful transfer", async () => {
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toMatchObject({ ok: true, newCar: expect.objectContaining({ id: "new-car-id" }) });
  });

  it("writes the old car (marked transferredTo) before writing the new car", async () => {
    const callOrder: string[] = [];
    mocks.upsert.mockImplementation((doc: any) => {
      callOrder.push(doc.pk === fromEmail ? "old" : "new");
      return Promise.resolve();
    });
    await transferCar(fromEmail, carId, toEmail, false);
    expect(callOrder).toEqual(["old", "new"]);
  });

  it("sets transferredTo on the old car document", async () => {
    await transferCar(fromEmail, carId, toEmail, false);
    const oldCarWrite = mocks.upsert.mock.calls[0][0];
    expect(oldCarWrite.transferredTo).toMatchObject({
      newCarId: "new-car-id",
      newOwnerEmail: toEmail,
    });
  });

  it("sets transferredFrom on the new car document", async () => {
    await transferCar(fromEmail, carId, toEmail, false);
    const newCarWrite = mocks.upsert.mock.calls[1][0];
    expect(newCarWrite.transferredFrom).toMatchObject({
      previousCarId: carId,
      previousOwnerEmail: fromEmail,
    });
  });

  it("carries car identity fields to the new car", async () => {
    const result = await transferCar(fromEmail, carId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newCar).toMatchObject({
      make: "Ford",
      model: "Focus",
      year: 2020,
      fuelType: "petrol",
      engineLitres: 1.6,
    });
  });

  it("resets the new car's startingMileage to the current mileage at transfer", async () => {
    const result = await transferCar(fromEmail, carId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newCar.startingMileage).toBe(15000);
  });

  it("preserves dateAdded from the original car (tracking start date survives ownership change)", async () => {
    const result = await transferCar(fromEmail, carId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newCar.dateAdded).toBe("2023-01-01");
  });

  it("resets nickname to make+model default rather than inheriting the previous owner's name", async () => {
    const result = await transferCar(fromEmail, carId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newCar.nickname).toBe("Ford Focus");
  });

  it("includes a frozen summary at transfer in transferredFrom", async () => {
    mocks.computeCarSellerReportRowsAndMetrics.mockReturnValue({
      rows: [1, 2, 3], total: 850, verdictMetrics: {},
    });
    mocks.computeSellerVerdict.mockReturnValue({ label: "Excellent" });
    const result = await transferCar(fromEmail, carId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newCar.transferredFrom?.summaryAtTransfer).toMatchObject({
      totalEntries: 3,
      totalSpend: 850,
      documentationVerdictLabel: "Excellent",
      mileageAtTransfer: 15000,
    });
  });

  // ── includeRecords flag ─────────────────────────────────────────────────

  it("does not call copyCarTrackerDoc when includeRecords is false", async () => {
    await transferCar(fromEmail, carId, toEmail, false);
    expect(mocks.copyCarTrackerDoc).not.toHaveBeenCalled();
  });

  it("copies all record types when includeRecords is true", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1" }]);
    mocks.getCarMods.mockResolvedValue([{ id: "m-1" }]);
    mocks.getCarBills.mockResolvedValue([{ id: "bl-1" }]);
    mocks.getCarFuelLogs.mockResolvedValue([{ id: "fl-1" }]);
    mocks.getCarReminders.mockResolvedValue([{ id: "rm-1" }]);

    await transferCar(fromEmail, carId, toEmail, true);

    expect(mocks.copyCarTrackerDoc).toHaveBeenCalledTimes(5);
    const types = mocks.copyCarTrackerDoc.mock.calls.map((c: any[]) => c[1]);
    expect(types).toEqual(expect.arrayContaining(["carService", "carMod", "carBill", "carFuel", "carReminder"]));
  });

  it("resets notifiedAt to null when copying reminders", async () => {
    mocks.getCarReminders.mockResolvedValue([{ id: "rm-1", notifiedAt: "2025-01-01" }]);
    await transferCar(fromEmail, carId, toEmail, true);
    const reminderCopy = mocks.copyCarTrackerDoc.mock.calls.find((c: any[]) => c[1] === "carReminder");
    expect(reminderCopy![4]).toEqual({ notifiedAt: null });
  });

  it("still returns ok:true if a record copy fails (best-effort copies)", async () => {
    mocks.getCarServiceRecords.mockResolvedValue([{ id: "sr-1" }]);
    mocks.copyCarTrackerDoc.mockRejectedValue(new Error("copy failed"));
    const result = await transferCar(fromEmail, carId, toEmail, true);
    expect(result).toMatchObject({ ok: true });
  });

  // ── billSeries (recurring instalment plans) - mirrors bikeTransfer.test.ts ──

  it("copies an active bill series to the recipient when includeRecords is true", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([{ id: "series-1", status: "active" }]);
    await transferCar(fromEmail, carId, toEmail, true);
    const seriesCopy = mocks.copyCarTrackerDoc.mock.calls.find((c: any[]) => c[1] === "carBillSeries");
    expect(seriesCopy).toBeDefined();
    expect(seriesCopy![0]).toMatchObject({ id: "series-1" });
    expect(seriesCopy![2]).toBe(toEmail);
    expect(seriesCopy![3]).toBe("new-car-id");
  });

  it("does not copy an already-ended or completed bill series", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([
      { id: "ended-series", status: "ended" },
      { id: "completed-series", status: "completed" },
    ]);
    await transferCar(fromEmail, carId, toEmail, true);
    const seriesCopy = mocks.copyCarTrackerDoc.mock.calls.find((c: any[]) => c[1] === "carBillSeries");
    expect(seriesCopy).toBeUndefined();
  });

  it("does not copy any bill series when includeRecords is false", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([{ id: "series-1", status: "active" }]);
    await transferCar(fromEmail, carId, toEmail, false);
    expect(mocks.copyCarTrackerDoc).not.toHaveBeenCalled();
  });

  it("ends the previous owner's active bill series even when includeRecords is false", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([{ id: "series-1", status: "active" }]);
    await transferCar(fromEmail, carId, toEmail, false);
    expect(mocks.endCarBillSeries).toHaveBeenCalledWith(fromEmail, "series-1");
  });

  it("ends every active bill series when includeRecords is true, alongside copying them", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([{ id: "series-1", status: "active" }, { id: "series-2", status: "active" }]);
    await transferCar(fromEmail, carId, toEmail, true);
    expect(mocks.endCarBillSeries).toHaveBeenCalledWith(fromEmail, "series-1");
    expect(mocks.endCarBillSeries).toHaveBeenCalledWith(fromEmail, "series-2");
  });

  it("does not call endCarBillSeries when there are no active bill series", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([{ id: "ended-series", status: "ended" }]);
    await transferCar(fromEmail, carId, toEmail, true);
    expect(mocks.endCarBillSeries).not.toHaveBeenCalled();
  });

  it("still returns ok:true if ending the previous owner's bill series fails", async () => {
    mocks.getBillSeriesForCar.mockResolvedValue([{ id: "series-1", status: "active" }]);
    mocks.endCarBillSeries.mockRejectedValue(new Error("update failed"));
    const result = await transferCar(fromEmail, carId, toEmail, false);
    expect(result).toMatchObject({ ok: true });
  });
});
