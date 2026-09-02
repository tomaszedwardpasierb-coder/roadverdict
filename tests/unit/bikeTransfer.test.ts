import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getContainer: vi.fn(),
  getBike: vi.fn(),
  getBikesForUser: vi.fn(),
  generateBikeId: vi.fn(),
  countActiveBikes: vi.fn(),
  getCurrentRegistration: vi.fn(),
  getServiceRecords: vi.fn(),
  getMods: vi.fn(),
  getBills: vi.fn(),
  getFuelLogs: vi.fn(),
  getReminders: vi.fn(),
  copyTrackerDoc: vi.fn(),
  computeSellerReportRowsAndMetrics: vi.fn(),
  computeSellerVerdict: vi.fn(),
  upsert: vi.fn(),
  isPro: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: mocks.getContainer,
}));
vi.mock("@/lib/tracker/bike", () => ({
  getBike: mocks.getBike,
  getBikesForUser: mocks.getBikesForUser,
  generateBikeId: mocks.generateBikeId,
  countActiveBikes: mocks.countActiveBikes,
  getCurrentRegistration: mocks.getCurrentRegistration,
  MAX_FREE_BIKES: 2,
}));
vi.mock("@/lib/tracker/serviceRecord", () => ({ getServiceRecords: mocks.getServiceRecords }));
vi.mock("@/lib/tracker/mod", () => ({ getMods: mocks.getMods }));
vi.mock("@/lib/tracker/bill", () => ({ getBills: mocks.getBills }));
vi.mock("@/lib/tracker/fuelLog", () => ({ getFuelLogs: mocks.getFuelLogs }));
vi.mock("@/lib/tracker/reminder", () => ({ getReminders: mocks.getReminders }));
vi.mock("@/lib/tracker/cosmosHelpers", () => ({ copyTrackerDoc: mocks.copyTrackerDoc }));
vi.mock("@/lib/tracker/sellerReportData", () => ({
  computeSellerReportRowsAndMetrics: mocks.computeSellerReportRowsAndMetrics,
}));
vi.mock("@/lib/tracker/sellerReportVerdict", () => ({
  computeSellerVerdict: mocks.computeSellerVerdict,
}));
vi.mock("@/lib/subscriptions", () => ({ isPro: mocks.isPro }));

import { transferBike } from "@/lib/tracker/bikeTransfer";

const fromEmail = "seller@example.com";
const toEmail = "buyer@example.com";
const bikeId = "bike-1";

const oldBike = {
  id: bikeId,
  pk: fromEmail,
  type: "bike",
  make: "Yamaha",
  model: "MT-07",
  year: 2020,
  engineCC: 689,
  bikeClass: "naked",
  isCustomBuild: false,
  originalRegistration: "AB20YAM",
  registrationChanges: [],
  currentMileage: 15000,
  startingMileage: 0,
  nickname: "My MT-07",
  region: "london",
  dateAdded: "2023-01-01",
  dvlaData: null,
} as any;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getBike.mockResolvedValue({ ...oldBike });
  mocks.getBikesForUser.mockResolvedValue([]);
  mocks.countActiveBikes.mockReturnValue(0);
  mocks.getCurrentRegistration.mockReturnValue("AB20YAM");
  mocks.generateBikeId.mockReturnValue("new-bike-id");
  mocks.getServiceRecords.mockResolvedValue([]);
  mocks.getMods.mockResolvedValue([]);
  mocks.getBills.mockResolvedValue([]);
  mocks.getFuelLogs.mockResolvedValue([]);
  mocks.getReminders.mockResolvedValue([]);
  mocks.computeSellerReportRowsAndMetrics.mockReturnValue({
    rows: [], total: 0, verdictMetrics: {},
  });
  mocks.computeSellerVerdict.mockReturnValue({ label: "Good" });
  mocks.copyTrackerDoc.mockResolvedValue(undefined);
  mocks.upsert.mockResolvedValue(undefined);
  mocks.getContainer.mockReturnValue({ items: { upsert: mocks.upsert } });
});

describe("transferBike", () => {
  // ── Guard conditions ────────────────────────────────────────────────────

  it("returns same_owner when fromEmail equals toEmail", async () => {
    const result = await transferBike(fromEmail, bikeId, fromEmail, false);
    expect(result).toEqual({ ok: false, reason: "same_owner" });
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("returns bike_not_found when getBike returns null", async () => {
    mocks.getBike.mockResolvedValue(null);
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "bike_not_found" });
  });

  it("returns already_transferred when the bike already has a transferredTo field", async () => {
    mocks.getBike.mockResolvedValue({
      ...oldBike,
      transferredTo: { newBikeId: "x", newOwnerEmail: "other@example.com", transferredAt: "2025-01-01" },
    });
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "already_transferred" });
  });

  it("returns recipient_limit_reached when recipient is already at the free bike cap", async () => {
    mocks.countActiveBikes.mockReturnValue(2); // MAX_FREE_BIKES = 2
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toMatchObject({ ok: false, reason: "recipient_limit_reached", limit: 2 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  // Pro accounts skip the cap entirely, per subscriptions.ts's isPro()
  // (temporarily true for everyone while no payment platform is wired
  // in - see that file's own comment).
  it("lets a transfer through past the recipient's free bike cap when the recipient is Pro", async () => {
    mocks.countActiveBikes.mockReturnValue(2); // MAX_FREE_BIKES = 2
    mocks.isPro.mockResolvedValue(true);
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result.ok).toBe(true);
  });

  it("returns recipient_already_has_bike when the recipient's own bikes already include this registration", async () => {
    // Checked directly against the recipient's own bikes (getBikesForUser),
    // not a cross-account search - see the source comment on why: a
    // cross-account search has no way to exclude the bike actually being
    // transferred, so it could return the SOURCE bike's own trivial
    // self-match instead of the recipient's.
    mocks.getBikesForUser.mockResolvedValue([
      { originalRegistration: "AB20YAM", registrationChanges: [] },
    ]);
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "recipient_already_has_bike" });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("matches a registration the recipient's bike has only ever held via a later registrationChanges entry, not just its original plate", async () => {
    mocks.getBikesForUser.mockResolvedValue([
      { originalRegistration: "OLDPLATE", registrationChanges: [{ plate: "AB20YAM", reason: "correction", changedAt: "2025-01-01" }] },
    ]);
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toEqual({ ok: false, reason: "recipient_already_has_bike" });
  });

  it("does not flag a collision when the recipient's bikes have a genuinely different registration", async () => {
    mocks.getBikesForUser.mockResolvedValue([
      { originalRegistration: "DIFFERENT1", registrationChanges: [] },
    ]);
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toMatchObject({ ok: true });
  });

  it("does not check registration collision when the bike has no current registration", async () => {
    mocks.getCurrentRegistration.mockReturnValue(null);
    mocks.getBikesForUser.mockResolvedValue([
      { originalRegistration: "AB20YAM", registrationChanges: [] }, // would collide if checked, but shouldn't be
    ]);
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toMatchObject({ ok: true });
  });

  // ── Happy path ──────────────────────────────────────────────────────────

  it("returns ok:true with the new bike on a successful transfer", async () => {
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    expect(result).toMatchObject({ ok: true, newBike: expect.objectContaining({ id: "new-bike-id" }) });
  });

  it("writes the old bike (marked transferredTo) before writing the new bike", async () => {
    const callOrder: string[] = [];
    mocks.upsert.mockImplementation((doc: any) => {
      callOrder.push(doc.pk === fromEmail ? "old" : "new");
      return Promise.resolve();
    });
    await transferBike(fromEmail, bikeId, toEmail, false);
    expect(callOrder).toEqual(["old", "new"]);
  });

  it("sets transferredTo on the old bike document", async () => {
    await transferBike(fromEmail, bikeId, toEmail, false);
    const oldBikeWrite = mocks.upsert.mock.calls[0][0];
    expect(oldBikeWrite.transferredTo).toMatchObject({
      newBikeId: "new-bike-id",
      newOwnerEmail: toEmail,
    });
  });

  it("sets transferredFrom on the new bike document", async () => {
    await transferBike(fromEmail, bikeId, toEmail, false);
    const newBikeWrite = mocks.upsert.mock.calls[1][0];
    expect(newBikeWrite.transferredFrom).toMatchObject({
      previousBikeId: bikeId,
      previousOwnerEmail: fromEmail,
    });
  });

  it("carries bike identity fields to the new bike", async () => {
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newBike).toMatchObject({
      make: "Yamaha",
      model: "MT-07",
      year: 2020,
      engineCC: 689,
    });
  });

  it("resets the new bike's startingMileage to the current mileage at transfer", async () => {
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newBike.startingMileage).toBe(15000);
  });

  it("preserves dateAdded from the original bike (tracking start date survives ownership change)", async () => {
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newBike.dateAdded).toBe("2023-01-01");
  });

  it("resets nickname to make+model default rather than inheriting the previous owner's name", async () => {
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newBike.nickname).toBe("Yamaha MT-07");
  });

  it("includes a frozen summary at transfer in transferredFrom", async () => {
    mocks.computeSellerReportRowsAndMetrics.mockReturnValue({
      rows: [1, 2, 3], total: 850, verdictMetrics: {},
    });
    mocks.computeSellerVerdict.mockReturnValue({ label: "Excellent" });
    const result = await transferBike(fromEmail, bikeId, toEmail, false);
    if (!result.ok) throw new Error("Expected ok");
    expect(result.newBike.transferredFrom?.summaryAtTransfer).toMatchObject({
      totalEntries: 3,
      totalSpend: 850,
      documentationVerdictLabel: "Excellent",
      mileageAtTransfer: 15000,
    });
  });

  // ── includeRecords flag ─────────────────────────────────────────────────

  it("does not call copyTrackerDoc when includeRecords is false", async () => {
    await transferBike(fromEmail, bikeId, toEmail, false);
    expect(mocks.copyTrackerDoc).not.toHaveBeenCalled();
  });

  it("copies all record types when includeRecords is true", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1" }]);
    mocks.getMods.mockResolvedValue([{ id: "m-1" }]);
    mocks.getBills.mockResolvedValue([{ id: "bl-1" }]);
    mocks.getFuelLogs.mockResolvedValue([{ id: "fl-1" }]);
    mocks.getReminders.mockResolvedValue([{ id: "rm-1" }]);

    await transferBike(fromEmail, bikeId, toEmail, true);

    expect(mocks.copyTrackerDoc).toHaveBeenCalledTimes(5);
    const types = mocks.copyTrackerDoc.mock.calls.map((c: any[]) => c[1]);
    expect(types).toEqual(expect.arrayContaining(["service", "mod", "bill", "fuel", "reminder"]));
  });

  it("resets notifiedAt to null when copying reminders", async () => {
    mocks.getReminders.mockResolvedValue([{ id: "rm-1", notifiedAt: "2025-01-01" }]);
    await transferBike(fromEmail, bikeId, toEmail, true);
    const reminderCopy = mocks.copyTrackerDoc.mock.calls.find((c: any[]) => c[1] === "reminder");
    expect(reminderCopy![4]).toEqual({ notifiedAt: null });
  });

  it("still returns ok:true if a record copy fails (best-effort copies)", async () => {
    mocks.getServiceRecords.mockResolvedValue([{ id: "sr-1" }]);
    mocks.copyTrackerDoc.mockRejectedValue(new Error("copy failed"));
    const result = await transferBike(fromEmail, bikeId, toEmail, true);
    expect(result).toMatchObject({ ok: true });
  });
});
